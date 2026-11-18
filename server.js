
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

io.on("connection", (socket) => {

    console.log("User connected:", socket.id);

    socket.on("join-room", async (roomId) => {

        if (typeof roomId !== "string" || !roomId.trim()) {
            socket.emit("error-message", "Invalid room ID");
            return;
        }

        const room = roomId.trim();

        const existingUsers = await io.in(room).fetchSockets();

        // Allow maximum two users
        if (existingUsers.length >= 2) {
            socket.emit("error-message", "Room is full");
            return;
        }

        socket.join(room);
        socket.data.roomId = room;

        console.log(socket.id, "joined", room);

        if (existingUsers.length === 1) {

            const existingUser = existingUsers[0];

            socket.emit("room-joined", existingUser.id);

            existingUser.emit("user-joined", socket.id);

        } else {

            socket.emit("waiting", "Waiting for another user");

        }

    });

    // Relay WebRTC signaling messages
    socket.on("offer", ({ target, offer }) => {
        io.to(target).emit("offer", {
            sender: socket.id,
            offer
        });
    });

    socket.on("answer", ({ target, answer }) => {
        io.to(target).emit("answer", {
            sender: socket.id,
            answer
        });
    });

    socket.on("ice-candidate", ({ target, candidate }) => {
        io.to(target).emit("ice-candidate", {
            sender: socket.id,
            candidate
        });
    });

    socket.on("disconnect", () => {

        const room = socket.data.roomId;

        if (room) {
            socket.to(room).emit("user-left");
        }

        console.log("User disconnected:", socket.id);

    });

});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});
