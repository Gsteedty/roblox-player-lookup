const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const trackedUsers = new Set();

let monitoring = false;

//==================================================
// ROBLOX API HELPER
//==================================================

async function robloxFetch(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return {
      available: response.ok,
      status: response.status,
      data
    };

  } catch (error) {
    console.error("Roblox API error:", error);

    return {
      available: false,
      status: 500,
      data: null
    };
  }
}

//==================================================
// USER
//==================================================

async function getUser(userId) {
  return robloxFetch(
    `https://users.roblox.com/v1/users/${userId}`
  );
}

//==================================================
// AVATAR
//==================================================

async function getAvatar(userId) {
  return robloxFetch(
    `https://avatar.roblox.com/v1/users/${userId}/avatar`
  );
}

//==================================================
// CURRENTLY WEARING
//==================================================

async function getCurrentlyWearing(userId) {
  return robloxFetch(
    `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`
  );
}

//==================================================
// OUTFITS
//==================================================

async function getOutfits(userId) {
  return robloxFetch(
    `https://avatar.roblox.com/v2/avatar/users/${userId}/outfits`
  );
}

//==================================================
// GROUPS
//==================================================

async function getGroups(userId) {
  return robloxFetch(
    `https://groups.roblox.com/v2/users/${userId}/groups/roles`
  );
}

//==================================================
// FRIENDS
//==================================================

async function getFriends(userId) {
  try {
    const response = await fetch(
      `https://friends.roblox.com/v1/users/${userId}/friends`
    );

    if (!response.ok) {
      return {
        available: false,
        status: response.status,
        data: []
      };
    }

    const result = await response.json();

    const friends = Array.isArray(result.data)
      ? result.data
      : [];

    const normalizedFriends = friends.map(friend => ({
      id: friend.id ?? null,
      name: friend.name ?? null,
      displayName: friend.displayName ?? null
    }));

    return {
      available: true,
      status: response.status,

      data: {
        previousPageCursor:
          result.previousPageCursor ?? null,

        nextPageCursor:
          result.nextPageCursor ?? null,

        data: normalizedFriends
      }
    };

  } catch (error) {
    console.error(
      "Friends API error:",
      error
    );

    return {
      available: false,
      status: 500,
      data: []
    };
  }
}

//==================================================
// FRIEND COUNT
//==================================================

async function getFriendCount(userId) {
  return robloxFetch(
    `https://friends.roblox.com/v1/users/${userId}/friends/count`
  );
}

//==================================================
// USERNAME HISTORY
//==================================================

async function getUsernameHistory(userId) {
  return robloxFetch(
    `https://users.roblox.com/v1/users/${userId}/username-history`
  );
}

//==================================================
// BADGES
//==================================================

async function getBadges(userId) {
  return robloxFetch(
    `https://badges.roblox.com/v1/users/${userId}/badges?limit=100&sortOrder=Desc`
  );
}

//==================================================
// CREATED EXPERIENCES
//==================================================

async function getCreatedGames(userId) {
  return robloxFetch(
    `https://games.roblox.com/v2/users/${userId}/games?accessFilter=Public&limit=50&sortOrder=Desc`
  );
}

//==================================================
// FAVORITE EXPERIENCES
//==================================================

async function getFavoriteGames(userId) {
  return robloxFetch(
    `https://games.roblox.com/v2/users/${userId}/favorites?limit=50&sortOrder=Desc`
  );
}

//==================================================
// THUMBNAILS
//==================================================

async function getThumbnails(userId) {
  return robloxFetch(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`
  );
}

//==================================================
// PRESENCE
//==================================================

async function getPresenceObject(userId) {
  try {
    const response = await fetch(
      "https://presence.roblox.com/v1/presence/users",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          userIds: [Number(userId)]
        })
      }
    );

    if (!response.ok) {
      return {
        available: false,
        status: response.status,
        data: null
      };
    }

    const result = await response.json();

    return {
      available: true,
      status: response.status,
      data:
        result.userPresences?.[0] || null
    };

  } catch (error) {
    console.error(
      "Presence API error:",
      error
    );

    return {
      available: false,
      status: 500,
      data: null
    };
  }
}

function isOnline(presence) {
  if (!presence) {
    return false;
  }

  return (
    presence.userPresenceType === 1 ||
    presence.userPresenceType === 2 ||
    presence.userPresenceType === 3
  );
}

//==================================================
// SUPABASE
//==================================================

async function supabaseFetch(
  path,
  options = {}
) {
  if (
    !SUPABASE_URL ||
    !SUPABASE_KEY
  ) {
    return {
      available: false,
      data: null
    };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${path}`,
      {
        ...options,

        headers: {
          "Content-Type":
            "application/json",

          "apikey":
            SUPABASE_KEY,

          "Authorization":
            `Bearer ${SUPABASE_KEY}`,

          ...(options.headers || {})
        }
      }
    );

    const text =
      await response.text();

    let data = null;

    try {
      data =
        text
          ? JSON.parse(text)
          : null;
    } catch {
      data = text;
    }

    return {
      available: response.ok,
      status: response.status,
      data
    };

  } catch (error) {
    console.error(
      "Supabase error:",
      error
    );

    return {
      available: false,
      status: 500,
      data: null
    };
  }
}

//==================================================
// GET SAVED PRESENCE
//==================================================

async function getSavedPresence(userId) {
  const result =
    await supabaseFetch(
      `presence_history?user_id=eq.${userId}&select=*`
    );

  if (
    !result.available ||
    !Array.isArray(result.data) ||
    !result.data[0]
  ) {
    return null;
  }

  return result.data[0];
}

//==================================================
// REGISTER USER
//==================================================

async function registerUser(userId) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return;
  }

  await supabaseFetch(
    "presence_history",
    {
      method: "POST",

      headers: {
        "Prefer":
          "resolution=merge-duplicates"
      },

      body: JSON.stringify({
        user_id: Number(userId),

        last_online: null,

        last_status: "Unknown"
      })
    }
  );
}

//==================================================
// SAVE ONLINE PRESENCE
//==================================================

async function saveOnlinePresence(userId) {
  await supabaseFetch(
    `presence_history?user_id=eq.${userId}`,
    {
      method: "PATCH",

      body: JSON.stringify({
        last_online:
          new Date().toISOString(),

        last_status:
          "Online",

        updated_at:
          new Date().toISOString()
      })
    }
  );
}

//==================================================
// SAVE OFFLINE PRESENCE
//==================================================

async function saveOfflinePresence(userId) {
  await supabaseFetch(
    `presence_history?user_id=eq.${userId}`,
    {
      method: "PATCH",

      body: JSON.stringify({
        last_status:
          "Offline",

        updated_at:
          new Date().toISOString()
      })
    }
  );
}

//==================================================
// TRACK USER
//==================================================

async function trackUser(userId) {
  userId =
    Number(userId);

  if (!Number.isFinite(userId)) {
    return null;
  }

  trackedUsers.add(userId);

  await registerUser(userId);

  const presence =
    await getPresenceObject(userId);

  const saved =
    await getSavedPresence(userId);

  if (!presence.available) {
    return {
      online: null,

      status:
        saved?.last_status ||
        "Unknown",

      lastOnline:
        saved?.last_online ||
        null
    };
  }

  const online =
    isOnline(presence.data);

  if (online) {
    await saveOnlinePresence(
      userId
    );

    return {
      online: true,

      status: "Online",

      lastOnline:
        new Date().toISOString()
    };
  }

  await saveOfflinePresence(
    userId
  );

  return {
    online: false,

    status: "Offline",

    lastOnline:
      saved?.last_online ||
      null
  };
}

//==================================================
// AUTOMATIC MONITOR
//==================================================

async function monitorUsers() {
  if (monitoring) {
    return;
  }

  monitoring = true;

  try {
    const result =
      await supabaseFetch(
        "presence_history?select=user_id"
      );

    if (
      result.available &&
      Array.isArray(result.data)
    ) {
      for (const row of result.data) {
        if (!row.user_id) {
          continue;
        }

        trackedUsers.add(
          Number(row.user_id)
        );
      }
    }

    for (const userId of trackedUsers) {
      try {
        await trackUser(userId);
      } catch (error) {
        console.error(
          `Monitor error for ${userId}:`,
          error
        );
      }

      await new Promise(
        resolve =>
          setTimeout(resolve, 250)
      );
    }

  } finally {
    monitoring = false;
  }
}

//==================================================
// PLAYER API
//==================================================

app.get(
  "/api/player/:userId",
  async (req, res) => {

    const userId =
      Number(req.params.userId);

    if (
      !Number.isFinite(userId) ||
      userId <= 0
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Invalid Roblox User ID."
      });
    }

    try {

      const [
        identity,
        avatar,
        wearing,
        outfits,
        groups,
        friends,
        friendCount,
        usernameHistory,
        badges,
        createdGames,
        favoriteGames,
        thumbnails
      ] =
        await Promise.all([
          getUser(userId),

          getAvatar(userId),

          getCurrentlyWearing(
            userId
          ),

          getOutfits(userId),

          getGroups(userId),

          getFriends(userId),

          getFriendCount(userId),

          getUsernameHistory(
            userId
          ),

          getBadges(userId),

          getCreatedGames(
            userId
          ),

          getFavoriteGames(
            userId
          ),

          getThumbnails(userId)
        ]);

      // Track the user independently
      // of whether the requester is online.
      const presence =
        await trackUser(userId);

      if (
        !identity.available ||
        !identity.data
      ) {
        return res.status(404).json({
          success: false,
          error:
            "Roblox user not found."
        });
      }

      return res.json({

        success: true,

        identity: {
          available:
            identity.available,

          status:
            identity.status,

          data:
            identity.data
        },

        avatar: {
          available:
            avatar.available,

          status:
            avatar.status,

          data:
            avatar.data
        },

        currentlyWearing: {
          available:
            wearing.available,

          status:
            wearing.status,

          data:
            wearing.data
        },

        outfits: {
          available:
            outfits.available,

          status:
            outfits.status,

          data:
            outfits.data
        },

        groups: {
          available:
            groups.available,

          status:
            groups.status,

          data:
            groups.data
        },

        friends: {
          available:
            friends.available,

          status:
            friends.status,

          data:
            friends.data
        },

        friendCount: {
          available:
            friendCount.available,

          status:
            friendCount.status,

          data:
            friendCount.data
        },

        usernameHistory: {
          available:
            usernameHistory.available,

          status:
            usernameHistory.status,

          data:
            usernameHistory.data
        },

        badges: {
          available:
            badges.available,

          status:
            badges.status,

          data:
            badges.data
        },

        createdGames: {
          available:
            createdGames.available,

          status:
            createdGames.status,

          data:
            createdGames.data
        },

        favoriteGames: {
          available:
            favoriteGames.available,

          status:
            favoriteGames.status,

          data:
            favoriteGames.data
        },

        thumbnails: {
          available:
            thumbnails.available,

          status:
            thumbnails.status,

          data:
            thumbnails.data
        },

        presence: {
          available:
            presence !== null,

          online:
            presence?.online ?? null,

          status:
            presence?.status ??
            "Unknown",

          lastOnline:
            presence?.lastOnline ??
            null
        },

        limitations: {
          presence:
            "Last online information is based on when this service observed the account online. Historical Roblox presence data is not publicly available for arbitrary users."
        }

      });

    } catch (error) {

      console.error(
        "Player lookup error:",
        error
      );

      return res.status(500).json({
        success: false,

        error:
          "Failed to retrieve player information."
      });
    }
  }
);

//==================================================
// HEALTH
//==================================================

app.get(
  "/health",
  (req, res) => {
    res.json({
      status: "online",
      service:
        "Roblox Player Lookup",
      version: "5.0"
    });
  }
);

//==================================================
// ROOT
//==================================================

app.get(
  "/",
  (req, res) => {
    res.json({
      status: "online",
      service:
        "Roblox Player Lookup",
      version: "5.0"
    });
  }
);

//==================================================
// START SERVER
//==================================================

app.listen(
  PORT,
  () => {

    console.log(
      "================================"
    );

    console.log(
      "ROBLOX PLAYER LOOKUP SERVER"
    );

    console.log(
      `Port: ${PORT}`
    );

    console.log(
      "Version: 5.0"
    );

    console.log(
      "Presence monitoring enabled."
    );

    console.log(
      "Friends API enabled."
    );

    console.log(
      "================================"
    );

    // Initial monitoring
    setTimeout(
      () => {
        monitorUsers();
      },
      10000
    );

    // Monitor every 2 minutes
    setInterval(
      () => {
        monitorUsers();
      },
      2 * 60 * 1000
    );
  }
);async function getCurrentlyWearing(userId) {
    return getJSON(
        `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`
    );
}

async function getOutfits(userId) {
    return getJSON(
        `https://avatar.roblox.com/v2/avatar/users/${userId}/outfits?itemsPerPage=100`
    );
}

async function getGroups(userId) {
    return getJSON(
        `https://groups.roblox.com/v2/users/${userId}/groups/roles`
    );
}

async function getFriends(userId) {
    return getJSON(
        `https://friends.roblox.com/v1/users/${userId}/friends`
    );
}

async function getFriendCount(userId) {
    return getJSON(
        `https://friends.roblox.com/v1/users/${userId}/friends/count`
    );
}

async function getUsernameHistory(userId) {
    return getJSON(
        `https://users.roblox.com/v1/users/${userId}/username-history?limit=100&sortOrder=Desc`
    );
}

async function getBadges(userId) {
    return getJSON(
        `https://accountinformation.roblox.com/v1/users/${userId}/roblox-badges`
    );
}

async function getCreatedGames(userId) {
    return getJSON(
        `https://games.roblox.com/v2/users/${userId}/games?accessFilter=Public&sortOrder=Asc&limit=50`
    );
}

async function getFavoriteGames(userId) {
    return getJSON(
        `https://games.roblox.com/v2/users/${userId}/favorite/games?sortOrder=Asc&limit=50`
    );
}

async function getThumbnails(userId) {
    const urls = {
        headshot:
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`,

        bust:
            `https://thumbnails.roblox.com/v1/users/avatar-bust?userIds=${userId}&size=420x420&format=Png&isCircular=false`,

        avatar:
            `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`
    };

    const results = {};

    for (const [name, url] of Object.entries(urls)) {
        results[name] = await getJSON(url);
    }

    return results;
}

//==================================================
// ROBLOX PRESENCE
//==================================================

async function getPresence(userId) {
    return getJSON(
        "https://presence.roblox.com/v1/presence/users",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                userIds: [userId]
            })
        }
    );
}

function getPresenceObject(presence) {
    if (
        !presence ||
        !presence.data ||
        !Array.isArray(presence.data.userPresences) ||
        !presence.data.userPresences[0]
    ) {
        return null;
    }

    return presence.data.userPresences[0];
}

function isOnline(presenceObject) {
    if (!presenceObject) {
        return false;
    }

    const type =
        presenceObject.userPresenceType;

    return (
        type === 1 ||
        type === 2 ||
        type === 3
    );
}

//==================================================
// SUPABASE PRESENCE DATABASE
//==================================================

async function getSavedPresence(userId) {
    try {
        const { data, error } = await supabase
            .from("presence_history")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

        if (error) {
            console.error(
                "Supabase read error:",
                error
            );

            return null;
        }

        return data;
    } catch (error) {
        console.error(
            "Presence read error:",
            error
        );

        return null;
    }
}

//--------------------------------------------------
// Register user for permanent monitoring
//--------------------------------------------------

async function registerUser(userId) {
    try {
        const existing =
            await getSavedPresence(userId);

        if (existing) {
            return existing;
        }

        const { data, error } =
            await supabase
                .from("presence_history")
                .insert({
                    user_id: userId,
                    last_online: null,
                    last_status: "Unknown",
                    updated_at:
                        new Date().toISOString()
                })
                .select()
                .maybeSingle();

        if (error) {
            console.error(
                "Supabase register error:",
                error
            );

            return null;
        }

        console.log(
            `Tracking user ${userId}`
        );

        return data;
    } catch (error) {
        console.error(
            "Register user error:",
            error
        );

        return null;
    }
}

//--------------------------------------------------
// Save online observation
//--------------------------------------------------

async function saveOnlinePresence(
    userId,
    timestamp
) {
    try {
        const { error } =
            await supabase
                .from("presence_history")
                .upsert({
                    user_id: userId,

                    last_online:
                        timestamp,

                    last_status:
                        "Online",

                    updated_at:
                        new Date().toISOString()
                });

        if (error) {
            console.error(
                "Supabase online save error:",
                error
            );
        }
    } catch (error) {
        console.error(
            "Online presence save error:",
            error
        );
    }
}

//--------------------------------------------------
// Save offline status WITHOUT deleting last_online
//--------------------------------------------------

async function saveOfflinePresence(userId) {
    try {
        const { error } =
            await supabase
                .from("presence_history")
                .update({
                    last_status: "Offline",

                    updated_at:
                        new Date().toISOString()
                })
                .eq("user_id", userId);

        if (error) {
            console.error(
                "Supabase offline update error:",
                error
            );
        }
    } catch (error) {
        console.error(
            "Offline presence error:",
            error
        );
    }
}

//==================================================
// TRACK ONE USER
//==================================================

async function trackUser(userId) {
    // Make absolutely sure the user is registered.
    await registerUser(userId);

    const presence =
        await getPresence(userId);

    if (!presence.available) {
        const saved =
            await getSavedPresence(userId);

        return {
            status:
                saved?.last_status ||
                "Unknown",

            lastOnline:
                saved?.last_online ||
                null,

            presence: null,

            apiAvailable: false
        };
    }

    const current =
        getPresenceObject(presence);

    if (!current) {
        const saved =
            await getSavedPresence(userId);

        return {
            status:
                saved?.last_status ||
                "Unknown",

            lastOnline:
                saved?.last_online ||
                null,

            presence: null,

            apiAvailable: true
        };
    }

    const online =
        isOnline(current);

    if (online) {
        const now =
            new Date().toISOString();

        await saveOnlinePresence(
            userId,
            now
        );

        return {
            status: "Online",

            lastOnline: now,

            presence: current,

            apiAvailable: true
        };
    }

    // IMPORTANT:
    // Do NOT overwrite last_online.
    await saveOfflinePresence(
        userId
    );

    const saved =
        await getSavedPresence(userId);

    return {
        status: "Offline",

        lastOnline:
            saved?.last_online ||
            null,

        presence: current,

        apiAvailable: true
    };
}

//==================================================
// GET ALL USERS BEING TRACKED
//==================================================

async function getTrackedUsers() {
    try {
        const { data, error } =
            await supabase
                .from("presence_history")
                .select("user_id");

        if (error) {
            console.error(
                "Tracked users error:",
                error
            );

            return [];
        }

        return data || [];
    } catch (error) {
        console.error(
            "Tracked users error:",
            error
        );

        return [];
    }
}

//==================================================
// BACKGROUND MONITOR
//==================================================

let monitoring = false;

async function monitorTrackedUsers() {
    if (monitoring) {
        console.log(
            "Previous monitoring cycle still running."
        );

        return;
    }

    monitoring = true;

    try {
        const users =
            await getTrackedUsers();

        if (users.length === 0) {
            console.log(
                "No users currently registered for monitoring."
            );

            return;
        }

        console.log(
            `Monitoring ${users.length} tracked user(s)...`
        );

        for (const row of users) {
            const userId =
                Number(row.user_id);

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {
                continue;
            }

            try {
                const result =
                    await trackUser(userId);

                console.log(
                    `User ${userId}: ${result.status}` +
                    (
                        result.lastOnline
                            ? ` | Last Online: ${result.lastOnline}`
                            : ""
                    )
                );
            } catch (error) {
                console.error(
                    `Monitor error for ${userId}:`,
                    error
                );
            }
        }
    } finally {
        monitoring = false;
    }
}

//==================================================
// START MONITOR
//==================================================

setTimeout(
    () => {
        monitorTrackedUsers();
    },
    10000
);

setInterval(
    () => {
        monitorTrackedUsers();
    },
    MONITOR_INTERVAL
);

//==================================================
// ROOT
//==================================================

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "Roblox Player Lookup",
        version: "5.0"
    });
});

//==================================================
// PLAYER LOOKUP
//==================================================

app.get(
    "/api/player/:userId",
    async (req, res) => {

        const userId =
            Number(req.params.userId);

        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid User ID."
            });
        }

        try {

            //--------------------------------------------------
            // Register immediately.
            //
            // This means the user stays tracked even after
            // the Roblox game is closed.
            //--------------------------------------------------

            await registerUser(
                userId
            );

            //--------------------------------------------------
            // Fetch public Roblox information
            //--------------------------------------------------

            const [
                user,
                avatar,
                currentlyWearing,
                outfits,
                groups,
                friends,
                friendCount,
                usernameHistory,
                badges,
                createdGames,
                favoriteGames,
                thumbnails,
                presence
            ] = await Promise.all([

                getUser(userId),

                getAvatar(userId),

                getCurrentlyWearing(
                    userId
                ),

                getOutfits(userId),

                getGroups(userId),

                getFriends(userId),

                getFriendCount(userId),

                getUsernameHistory(
                    userId
                ),

                getBadges(userId),

                getCreatedGames(
                    userId
                ),

                getFavoriteGames(
                    userId
                ),

                getThumbnails(
                    userId
                ),

                getPresence(
                    userId
                )
            ]);

            if (
                !user.available ||
                !user.data
            ) {
                return res.status(404).json({
                    success: false,
                    error:
                        "Roblox user not found."
                });
            }

            //--------------------------------------------------
            // Update tracking
            //--------------------------------------------------

            const tracked =
                await trackUser(
                    userId
                );

            //--------------------------------------------------
            // RESPONSE
            //--------------------------------------------------

            res.json({

                success: true,

                lookup: {
                    userId: userId,

                    retrievedAt:
                        new Date()
                            .toISOString()
                },

                identity: {
                    available:
                        user.available,

                    data:
                        user.data
                },

                presence: {

                    available:
                        presence.available,

                    data:
                        presence.data,

                    tracked:
                        tracked
                },

                avatar: {
                    available:
                        avatar.available,

                    data:
                        avatar.data
                },

                currentlyWearing: {
                    available:
                        currentlyWearing.available,

                    data:
                        currentlyWearing.data
                },

                outfits: {
                    available:
                        outfits.available,

                    data:
                        outfits.data
                },

                groups: {
                    available:
                        groups.available,

                    data:
                        groups.data
                },

                friends: {
                    available:
                        friends.available,

                    data:
                        friends.data
                },

                friendCount: {
                    available:
                        friendCount.available,

                    data:
                        friendCount.data
                },

                usernameHistory: {
                    available:
                        usernameHistory.available,

                    data:
                        usernameHistory.data
                },

                badges: {
                    available:
                        badges.available,

                    data:
                        badges.data
                },

                createdExperiences: {
                    available:
                        createdGames.available,

                    data:
                        createdGames.data
                },

                favoriteExperiences: {
                    available:
                        favoriteGames.available,

                    data:
                        favoriteGames.data
                },

                thumbnails:
                    thumbnails,

                limitations: {
                    message:
                        "Last Online is based on the most recent public Roblox presence observation recorded by this service."
                }
            });

        } catch (error) {

            console.error(
                "Lookup error:",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Unexpected lookup error."
            });
        }
    }
);

//==================================================
// HEALTH
//==================================================

app.get(
    "/health",
    (req, res) => {

        res.json({
            online: true,

            timestamp:
                new Date()
                    .toISOString()
        });
    }
);

//==================================================
// START SERVER
//==================================================

app.listen(
    PORT,
    () => {

        console.log(
            "========================================"
        );

        console.log(
            `Roblox Player Lookup v5 running on port ${PORT}`
        );

        console.log(
            "Persistent background presence tracking enabled."
        );

        console.log(
            "========================================"
        );
    }
);
