const socket = io();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startCamera = document.getElementById("startCamera");
const joinRoomBtn = document.getElementById("joinRoom");
const roomIdInput = document.getElementById("roomId");
const statusText = document.getElementById("status");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");

let localStream;
let peerConnection;
let remoteSocketId;

// Free Google STUN server to help browsers find each other's network path
const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// 1. Start Camera & Microphone
startCamera.addEventListener("click", async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;
        statusText.textContent = "Camera started. Enter a Room ID and click Join Room.";
    } catch (error) {
        console.error("Media access error:", error);
        statusText.textContent = "Error accessing camera/microphone.";
    }
});

// 2. Join a Room
joinRoomBtn.addEventListener("click", () => {
    const roomId = roomIdInput.value.trim();
    if (!localStream) {
        alert("Please click 'Start Camera' first!");
        return;
    }
    if (!roomId) {
        alert("Please enter a Room ID!");
        return;
    }
    socket.emit("join-room", roomId);
});

// 3. Create the WebRTC Peer Connection
function createPeerConnection(targetSocketId) {
    remoteSocketId = targetSocketId;
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Push our camera/mic tracks into the connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // When the other user's video/audio arrives, show it in remoteVideo
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Send network path (ICE candidate) to the other user via Socket.io
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", {
                target: remoteSocketId,
                candidate: event.candidate
            });
        }
    };
}

// 4. Socket.io Signaling Events (Matching your server.js)
socket.on("waiting", (msg) => {
    statusText.textContent = msg;
});

// Fires for the 2nd user who joins the room (they create the Offer)
socket.on("room-joined", async (existingUserId) => {
    statusText.textContent = "User found! Connecting...";
    createPeerConnection(existingUserId);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("offer", {
        target: existingUserId,
        offer: offer
    });
});

// Fires for the 1st user when the 2nd user joins
socket.on("user-joined", (newUserId) => {
    statusText.textContent = "Another user joined! Waiting for offer...";
    remoteSocketId = newUserId;
});

// Receive Offer -> Send Answer
socket.on("offer", async ({ sender, offer }) => {
    createPeerConnection(sender);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit("answer", {
        target: sender,
        answer: answer
    });
    statusText.textContent = "Connected!";
});

// Receive Answer
socket.on("answer", async ({ answer }) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    statusText.textContent = "Connected!";
});

// Receive ICE Candidate
socket.on("ice-candidate", async ({ candidate }) => {
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

// Handle Disconnect & Errors
socket.on("user-left", () => {
    statusText.textContent = "Remote user disconnected.";
    remoteVideo.srcObject = null;
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
});

socket.on("error-message", (msg) => {
    alert(msg);
});

// 5. Mute / Unmute Microphone
muteBtn.addEventListener("click", () => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    audioTracks.forEach(track => {
        track.enabled = !track.enabled;
    });
    muteBtn.textContent = audioTracks[0].enabled ? "Mute" : "Unmute";
});

// 6. Camera ON / OFF
cameraBtn.addEventListener("click", () => {
    if (!localStream) return;
    const videoTracks = localStream.getVideoTracks();
    videoTracks.forEach(track => {
        track.enabled = !track.enabled;
    });
    cameraBtn.textContent = videoTracks[0].enabled ? "Turn Camera Off" : "Turn Camera On";
});