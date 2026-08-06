import {WebSpeakClient} from "./api/WebspeakClient.ts";
import type {WebspeakConfig} from "./api/WebspeakConfig.ts";
import {AudioSource} from "./api/AudioSource.ts";

class AudioProfile{
    public audioId: number | null | undefined;
    private readonly _html: HTMLDivElement;

    constructor(public readonly uid: string, audioId: number | null | undefined, public readonly name: string){
        this.audioId = audioId;

        const card = document.createElement("div");
        card.className = "player-card";

        let initials = "?"
        if(name && name.length > 0) {
            initials = name
                .substring(0, Math.min(name.length, 2))
                .toUpperCase();
        }

        card.innerHTML = `<div class="player-avatar">
                            ${initials}
                        </div>

                        <div class="player-info">
                            <div class="player-name">${name}</div>
                            <div class="player-status">
                                <span class="player-status-dot"></span>
                                Connected
                            </div>
                        </div>

                        <span class="volume-label">Volume</span>

                        <div class="player-controls">
                            <div class="volume-slider-wrap">
                                <div class="volume-slider-bg"></div>

                                <input
                                        type="range"
                                        class="player-volume"
                                        min="0"
                                        max="200"
                                        value="100"
                                        aria-label="Volume for ${name}"
                                >
                            </div>

                            <button class="player-mute-btn" title="Mute ${name}">
                                <svg class="player-mic-icon" width="18" height="18" viewBox="0 0 24 24"
                                     fill="none" stroke="currentColor" stroke-width="2"
                                     stroke-linecap="round" stroke-linejoin="round">
                                    <path class="mic-body" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                    <path class="mic-stand" d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                    <line class="mic-line" x1="12" y1="19" x2="12" y2="23"></line>
                                    <line class="mic-base" x1="8" y1="23" x2="16" y2="23"></line>

                                    <!-- hidden until muted -->
                                    <line class="mic-slash" x1="4" y1="4" x2="20" y2="20"></line>
                                </svg>
                            </button>
                        </div>`;

        const muteButton = card.getElementsByClassName("player-mute-btn")[0] as HTMLButtonElement;

        muteButton.addEventListener("click", () => {
            muteButton.classList.toggle("active");
        });

        const volumeInput = card.getElementsByTagName("input")[0];

        volumeInput.addEventListener("change", () => {
            console.log(`player slider updated ${name}: ${volumeInput.value}`);
        });

        this._html = card;
    }

    public get html(): HTMLDivElement{
        return this._html;
    }
}

class AudioSourceWrapper{
    constructor(public readonly source: AudioSource) {

    }
}

const params: URLSearchParams = new URLSearchParams(window.location.search);
const sessionParam: string | null = params.get("id");
const relayParam: string | null = params.get("relay");
const relay: URL = relayParam ? new URL("ws://"+relayParam+"/join") : new URL("wss://webspeak.betrayd.net/join");

let client: WebSpeakClient | undefined;

let micStream: MediaStreamTrack | undefined;

const audioSources: Map<number, AudioSourceWrapper> = new Map<number, AudioSourceWrapper>();
const audioProfiles: Map<string, AudioProfile> = new Map();

function start(relayURL: URL, sessionId: string, initialMic: MediaStream): void{
    if(initialMic && initialMic.getAudioTracks().length > 0) {
        micStream = initialMic.getAudioTracks()[0];
    }
    const rtcConfig: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
    const config: WebspeakConfig = {
        relayURL: relayURL,
        sessionId: sessionId,
        rtcConfiguration: rtcConfig,
        retryAttempts: 10
    };
    const thisClient = new WebSpeakClient(config);
    client = thisClient;

    thisClient.onConnected.addListener(() => {
        updateMic(thisClient);
    });

    thisClient.onConnectionReset.addListener(() => {
        for(const prof in audioProfiles){
            audioProfiles.get(prof)?.html.remove();
        }
        audioProfiles.clear();
    })

    thisClient.onAudioProfileAdded.addListener((event) => {
        const prof: AudioProfile = new AudioProfile(event.uid, event.id, event.name);
        audioProfiles.set(event.uid, prof);

        addPlayerProf(prof);
    });

    thisClient.onAudioProfileRemoved.addListener((event) => {
        const prof = audioProfiles.get(event.uid);
        if(prof){
            prof.html.remove();
            audioProfiles.delete(event.uid);
        }else{
            console.warn(`Could not find audio profile to remove for ${event.uid}`);
        }
    });

    thisClient.start();
}

function updateMic(thisClient: WebSpeakClient){
    if(micStream !== undefined) {
        thisClient.setMic(micStream);
    }else{
        thisClient.setMic(null);
    }
}

const app = document.getElementById("app")!;
const landing = document.getElementById("landingScreen")!;
const enterButton = document.getElementById("enterAppBtn")!;
const sessionInput = document.getElementById("sessionId") as HTMLInputElement;
const joinButton = document.getElementById("enterAppBtn") as HTMLButtonElement;

const settingsButton = document.querySelector<HTMLButtonElement>(".settings-btn");
const settingsDrawer = document.querySelector<HTMLDivElement>("#settingsDrawer");
const closeDrawerButton = document.querySelector<HTMLButtonElement>("#closeDrawerBtn");

const muteButton = document.querySelector<HTMLButtonElement>("#mute-btn");
const deafenButton = document.querySelector<HTMLButtonElement>("#deafen-btn");

const playerList = document.querySelector<HTMLDivElement>("#player-list");

const toggles = document.querySelectorAll<HTMLButtonElement>(".toggle");

if (sessionParam) {
    sessionInput.value = sessionParam;
}

function updateJoinButton() {
    joinButton.disabled =
        sessionInput.value.trim().length === 0;
}

sessionInput.addEventListener("input", updateJoinButton);

updateJoinButton();

enterButton.addEventListener("click", async () => {

    const sessionId = sessionInput.value.trim();

    if (!sessionId) {
        console.log("How did we get here?");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        start(relay, sessionId, stream);

    } catch (_err) {

    }
    landing.classList.add("hidden");

    app.classList.remove("hidden");
});

toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
        toggle.classList.toggle("on");
    });
});

if (settingsButton && settingsDrawer && closeDrawerButton) {
    settingsButton.addEventListener("click", () => {
        settingsDrawer.classList.add("open");
    });

    closeDrawerButton.addEventListener("click", () => {
        settingsDrawer.classList.remove("open");
    });
}

muteButton?.addEventListener("click", () => {

    muteButton.classList.toggle("active");

    const text = muteButton.querySelector("span");

    if (text) {
        text.textContent = muteButton.classList.contains("active")
            ? "Muted"
            : "Mute";
    }

});


deafenButton?.addEventListener("click", () => {

    deafenButton.classList.toggle("active");

    const text = deafenButton.querySelector("span");

    if (text) {
        text.textContent = deafenButton.classList.contains("active")
            ? "Deafened"
            : "Deafen";
    }
});

function addPlayerProf(audioProfile: AudioProfile) {
    playerList?.appendChild(audioProfile.html);
}