const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const MONITOR_INTERVAL = 2 * 60 * 1000;

let monitoring = false;

//==================================================
// ROBLOX API HELPER
//==================================================

async function getJSON(url, options = {}) {
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

        console.error(
            "Roblox API error:",
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
// ROBLOX USER
//==================================================

async function getUser(userId) {
    return getJSON(
        `https://users.roblox.com/v1/users/${userId}`
    );
}

//==================================================
// AVATAR
//==================================================

async function getAvatar(userId) {
    return getJSON(
        `https://avatar.roblox.com/v1/users/${userId}/avatar`
    );
}

//==================================================
// CURRENTLY WEARING
//==================================================

async function getCurrentlyWearing(userId) {
    return getJSON(
        `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`
    );
}

//==================================================
// OUTFITS
//==================================================

async function getOutfits(userId) {
    return getJSON(
        `https://avatar.roblox.com/v2/avatar/users/${userId}/outfits?itemsPerPage=100`
    );
}

//==================================================
// GROUPS
//==================================================

async function getGroups(userId) {
    return getJSON(
        `https://groups.roblox.com/v2/users/${userId}/groups/roles`
    );
}

//==================================================
// FRIENDS
//==================================================

async function getFriends(userId) {

    const result = await getJSON(
        `https://friends.roblox.com/v1/users/${userId}/friends`
    );

    if (
        !result.available ||
        !result.data
    ) {
        return result;
    }

    const rawFriends =
        Array.isArray(result.data.data)
            ? result.data.data
            : [];

    const normalizedFriends =
        rawFriends.map(friend => ({

            id:
                friend.id ??
                null,

            name:
                friend.name ??
                null,

            displayName:
                friend.displayName ??
                null
        }));

    return {
        available: true,

        status:
            result.status,

        data: {
            previousPageCursor:
                result.data.previousPageCursor ??
                null,

            nextPageCursor:
                result.data.nextPageCursor ??
                null,

            data:
                normalizedFriends
        }
    };
}

//==================================================
// FRIEND COUNT
//==================================================

async function getFriendCount(userId) {
    return getJSON(
        `https://friends.roblox.com/v1/users/${userId}/friends/count`
    );
}

//==================================================
// USERNAME HISTORY
//==================================================

async function getUsernameHistory(userId) {
    return getJSON(
        `https://users.roblox.com/v1/users/${userId}/username-history?limit=100&sortOrder=Desc`
    );
}

//==================================================
// ROBLOX BADGES
//==================================================

async function getBadges(userId) {
    return getJSON(
        `https://accountinformation.roblox.com/v1/users/${userId}/roblox-badges`
    );
}

//==================================================
// CREATED EXPERIENCES
//==================================================

async function getCreatedGames(userId) {
    return getJSON(
        `https://games.roblox.com/v2/users/${userId}/games?accessFilter=Public&sortOrder=Asc&limit=50`
    );
}

//==================================================
// FAVORITE EXPERIENCES
//==================================================

async function getFavoriteGames(userId) {
    return getJSON(
        `https://games.roblox.com/v2/users/${userId}/favorite/games?sortOrder=Asc&limit=50`
    );
}

//==================================================
// THUMBNAILS
//==================================================

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

    for (
        const [name, url]
        of Object.entries(urls)
    ) {

        results[name] =
            await getJSON(url);
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
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({
                userIds: [
                    Number(userId)
                ]
            })
        }
    );
}

function getPresenceObject(presence) {

    if (
        !presence ||
        !presence.data ||
        !Array.isArray(
            presence.data.userPresences
        ) ||
        !presence.data.userPresences[0]
    ) {
        return null;
    }

    return (
        presence.data.userPresences[0]
    );
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
// SUPABASE REST API
//==================================================

async function supabaseRequest(
    path,
    options = {}
) {

    if (
        !SUPABASE_URL ||
        !SUPABASE_KEY
    ) {

        console.error(
            "Supabase environment variables are missing."
        );

        return {
            available: false,
            status: 500,
            data: null
        };
    }

    try {

        const response =
            await fetch(
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
            available:
                response.ok,

            status:
                response.status,

            data
        };

    } catch (error) {

        console.error(
            "Supabase request error:",
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
        await supabaseRequest(
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

    const existing =
        await getSavedPresence(userId);

    if (existing) {
        return existing;
    }

    const result =
        await supabaseRequest(
            "presence_history",
            {
                method: "POST",

                headers: {
                    "Prefer":
                        "return=representation"
                },

                body:
                    JSON.stringify({
                        user_id:
                            Number(userId),

                        last_online:
                            null,

                        last_status:
                            "Unknown",

                        updated_at:
                            new Date()
                                .toISOString()
                    })
            }
        );

    if (!result.available) {

        console.error(
            "Supabase register error:",
            result.data
        );

        return null;
    }

    console.log(
        `Tracking user ${userId}`
    );

    return (
        Array.isArray(result.data)
            ? result.data[0]
            : result.data
    );
}

//==================================================
// SAVE ONLINE PRESENCE
//==================================================

async function saveOnlinePresence(
    userId,
    timestamp
) {

    const result =
        await supabaseRequest(
            `presence_history?user_id=eq.${userId}`,
            {
                method: "PATCH",

                body:
                    JSON.stringify({
                        last_online:
                            timestamp,

                        last_status:
                            "Online",

                        updated_at:
                            new Date()
                                .toISOString()
                    })
            }
        );

    if (!result.available) {

        console.error(
            "Supabase online save error:",
            result.data
        );
    }
}

//==================================================
// SAVE OFFLINE STATUS
//==================================================

async function saveOfflinePresence(
    userId
) {

    const result =
        await supabaseRequest(
            `presence_history?user_id=eq.${userId}`,
            {
                method: "PATCH",

                body:
                    JSON.stringify({
                        last_status:
                            "Offline",

                        updated_at:
                            new Date()
                                .toISOString()
                    })
            }
        );

    if (!result.available) {

        console.error(
            "Supabase offline update error:",
            result.data
        );
    }
}

//==================================================
// TRACK ONE USER
//==================================================

async function trackUser(userId) {

    userId =
        Number(userId);

    if (
        !Number.isInteger(userId) ||
        userId <= 0
    ) {
        return null;
    }

    // Make sure this user is permanently tracked.
    await registerUser(userId);

    const presence =
        await getPresence(userId);

    if (!presence.available) {

        const saved =
            await getSavedPresence(
                userId
            );

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
        getPresenceObject(
            presence
        );

    if (!current) {

        const saved =
            await getSavedPresence(
                userId
            );

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

    //==================================================
    // USER IS ONLINE
    //==================================================

    if (online) {

        const now =
            new Date()
                .toISOString();

        await saveOnlinePresence(
            userId,
            now
        );

        return {

            status:
                "Online",

            lastOnline:
                now,

            presence:
                current,

            apiAvailable:
                true
        };
    }

    //==================================================
    // USER IS OFFLINE
    //
    // IMPORTANT:
    // Do NOT overwrite last_online.
    //==================================================

    await saveOfflinePresence(
        userId
    );

    const saved =
        await getSavedPresence(
            userId
        );

    return {

        status:
            "Offline",

        lastOnline:
            saved?.last_online ||
            null,

        presence:
            current,

        apiAvailable:
            true
    };
}

//==================================================
// GET ALL TRACKED USERS
//==================================================

async function getTrackedUsers() {

    const result =
        await supabaseRequest(
            "presence_history?select=user_id"
        );

    if (
        !result.available ||
        !Array.isArray(result.data)
    ) {

        return [];
    }

    return result.data;
}

//==================================================
// BACKGROUND PRESENCE MONITOR
//==================================================

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

        for (
            const row
            of users
        ) {

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
                    await trackUser(
                        userId
                    );

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

            // Small delay between users.
            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        250
                    )
            );
        }

    } finally {

        monitoring = false;
    }
}

//==================================================
// START BACKGROUND MONITOR
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

app.get(
    "/",
    (req, res) => {

        res.json({

            status:
                "online",

            service:
                "Roblox Player Lookup",

            version:
                "5.0"
        });
    }
);

//==================================================
// HEALTH
//==================================================

app.get(
    "/health",
    (req, res) => {

        res.json({

            online:
                true,

            service:
                "Roblox Player Lookup",

            timestamp:
                new Date()
                    .toISOString()
        });
    }
);

//==================================================
// PLAYER LOOKUP
//==================================================

app.get(
    "/api/player/:userId",
    async (req, res) => {

        const userId =
            Number(
                req.params.userId
            );

        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {

            return res.status(400).json({

                success:
                    false,

                error:
                    "Invalid Roblox User ID."
            });
        }

        try {

            // Register immediately so this
            // user stays monitored after lookup.
            await registerUser(
                userId
            );

            //==================================================
            // FETCH PUBLIC ROBLOX INFORMATION
            //==================================================

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

                getUser(
                    userId
                ),

                getAvatar(
                    userId
                ),

                getCurrentlyWearing(
                    userId
                ),

                getOutfits(
                    userId
                ),

                getGroups(
                    userId
                ),

                getFriends(
                    userId
                ),

                getFriendCount(
                    userId
                ),

                getUsernameHistory(
                    userId
                ),

                getBadges(
                    userId
                ),

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

                    success:
                        false,

                    error:
                        "Roblox user not found."
                });
            }

            //==================================================
            // UPDATE LAST ONLINE TRACKING
            //==================================================

            const tracked =
                await trackUser(
                    userId
                );

            //==================================================
            // RESPONSE
            //==================================================

            return res.json({

                success:
                    true,

                lookup: {

                    userId:
                        userId,

                    retrievedAt:
                        new Date()
                            .toISOString()
                },

                identity: {

                    available:
                        user.available,

                    status:
                        user.status,

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

                    status:
                        avatar.status,

                    data:
                        avatar.data
                },

                currentlyWearing: {

                    available:
                        currentlyWearing.available,

                    status:
                        currentlyWearing.status,

                    data:
                        currentlyWearing.data
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

                //==================================================
                // FRIENDS
                //==================================================

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

                createdExperiences: {

                    available:
                        createdGames.available,

                    status:
                        createdGames.status,

                    data:
                        createdGames.data
                },

                favoriteExperiences: {

                    available:
                        favoriteGames.available,

                    status:
                        favoriteGames.status,

                    data:
                        favoriteGames.data
                },

                thumbnails:
                    thumbnails,

                limitations: {

                    presence:
                        "Last Online is based on the most recent public Roblox presence observation recorded by this service."
                }
            });

        } catch (error) {

            console.error(
                "Player lookup error:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                error:
                    "Unexpected lookup error."
            });
        }
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
            "ROBLOX PLAYER LOOKUP v5"
        );

        console.log(
            `Running on port ${PORT}`
        );

        console.log(
            "Persistent presence tracking enabled."
        );

        console.log(
            "Friends API enabled."
        );

        console.log(
            "Background monitoring: 2 minutes"
        );

        console.log(
            "========================================"
        );
    }
);
