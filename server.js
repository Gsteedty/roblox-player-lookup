const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

async function getJSON(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                "Accept": "application/json",
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
        return {
            available: false,
            status: 0,
            data: null
        };
    }
}

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

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "Roblox Player Lookup",
        version: "2.0"
    });
});

app.get("/api/player/:userId", async (req, res) => {
    const userId = Number(req.params.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({
            success: false,
            error: "Invalid User ID."
        });
    }

    try {
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
            getCurrentlyWearing(userId),
            getOutfits(userId),
            getGroups(userId),
            getFriends(userId),
            getFriendCount(userId),
            getUsernameHistory(userId),
            getBadges(userId),
            getCreatedGames(userId),
            getFavoriteGames(userId),
            getThumbnails(userId),
            getPresence(userId)
        ]);

        if (!user.available || !user.data) {
            return res.status(404).json({
                success: false,
                error: "Roblox user not found."
            });
        }

        res.json({
            success: true,

            lookup: {
                userId: userId,
                retrievedAt: new Date().toISOString()
            },

            identity: {
                available: user.available,
                data: user.data
            },

            presence: {
                available: presence.available,
                data: presence.data
            },

            avatar: {
                available: avatar.available,
                data: avatar.data
            },

            currentlyWearing: {
                available: currentlyWearing.available,
                data: currentlyWearing.data
            },

            outfits: {
                available: outfits.available,
                data: outfits.data
            },

            groups: {
                available: groups.available,
                data: groups.data
            },

            friends: {
                available: friends.available,
                data: friends.data
            },

            friendCount: {
                available: friendCount.available,
                data: friendCount.data
            },

            usernameHistory: {
                available: usernameHistory.available,
                data: usernameHistory.data
            },

            badges: {
                available: badges.available,
                data: badges.data
            },

            createdExperiences: {
                available: createdGames.available,
                data: createdGames.data
            },

            favoriteExperiences: {
                available: favoriteGames.available,
                data: favoriteGames.data
            },

            thumbnails: thumbnails,

            limitations: {
                message:
                    "This lookup only returns information exposed by Roblox's public APIs. Private or unavailable information is not reconstructed or guessed."
            }
        });

    } catch (error) {
        console.error("Lookup error:", error);

        res.status(500).json({
            success: false,
            error: "Unexpected lookup error."
        });
    }
});

app.get("/health", (req, res) => {
    res.json({
        online: true,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(
        `Roblox Player Lookup v2 running on port ${PORT}`
    );
});
