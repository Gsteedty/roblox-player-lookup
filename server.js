const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

async function roblox(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Roblox API ${response.status}`);
    }

    return await response.json();
}

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "Roblox Player Lookup"
    });
});

app.get("/api/player/:userId", async (req, res) => {
    try {
        const userId = Number(req.params.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                error: "Invalid User ID"
            });
        }

        const [
            user,
            avatar,
            wearing,
            groups,
            friends,
            thumbnails
        ] = await Promise.allSettled([
            roblox(`https://users.roblox.com/v1/users/${userId}`),

            roblox(`https://avatar.roblox.com/v2/avatar/users/${userId}/avatar`),

            roblox(`https://avatar.roblox.com/v1/users/${userId}/currently-wearing`),

            roblox(`https://groups.roblox.com/v2/users/${userId}/groups/roles`),

            roblox(`https://friends.roblox.com/v1/users/${userId}/friends`),

            roblox(
                `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`
            )
        ]);

        const get = (result) =>
            result.status === "fulfilled" ? result.value : null;

        res.json({
            success: true,
            userId,

            identity: get(user),

            avatar: get(avatar),

            currentlyWearing: get(wearing),

            groups: get(groups),

            friends: get(friends),

            thumbnails: get(thumbnails),

            limitations: {
                note: "Only publicly accessible Roblox API information is returned. Some Roblox information is unavailable to third-party experiences."
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Unable to retrieve Roblox information."
        });
    }
});

app.listen(PORT, () => {
    console.log(`Roblox Player Lookup running on port ${PORT}`);
});
