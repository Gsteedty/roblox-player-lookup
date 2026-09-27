const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

//==================================================
// CONFIG
//==================================================

const MONITOR_INTERVAL = 2 * 60 * 1000;

//==================================================
// ROBLOX API HELPER
//==================================================

async function getJSON(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                Accept: "application/json",
                ...(options.headers || {})
            }
        });

        if (!response.ok) {
            return {
                available: false,
                status: response.status,
                data: null
            };
        }

        return {
            available: true,
            status: response.status,
            data: await response.json()
        };
    } catch (error) {
        console.error("Roblox API error:", error);

        return {
            available: false,
            status: 0,
            data: null
        };
    }
}

//==================================================
// ROBLOX DATA
//==================================================

async function getUser(userId) {
    return getJSON(
        `https://users.roblox.com/v1/users/${userId}`
    );
}

async function getAvatar(userId) {
    return getJSON(
        `https://avatar.roblox.com/v2/avatar/users/${userId}/avatar`
    );
}

async function getCurrentlyWearing(userId) {
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
