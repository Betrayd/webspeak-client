import {WebspeakEvent} from "./event/Event";
import type {WebspeakConfig} from "./WebspeakConfig.ts";
import {RTCSignalingMessages} from "./rtc/signaling/RTCSignalingMessages.ts";
import {RTCConnectionWrapper} from "./rtc/signaling/RTCConnectionWrapper.ts";
import {AudioSource} from "./AudioSource.ts";
import {ReliableMessages} from "./rtc/ReliableMessages.ts";
import {Vec3d} from "./Vec3d.ts";

export type DisconnectEvent = {
    readonly statusCode: number;
    readonly reason: String;
}

export type AudioProfileAddedEvent = {
    readonly uid: string;
    readonly name: string;
    readonly id: number | null | undefined;
}

export type AudioProfileUpdateEvent = {
    readonly uid: string;
    readonly id: number | null | undefined;
}

export type AudioProfileRemoveEvent = {
    readonly uid: string;
}

export class WebSpeakClient {
    private readonly _webSpeakConfig: WebspeakConfig;

    private readonly _fatalErrorEvent: WebspeakEvent.Invokable<unknown> = WebspeakEvent.create();
    private readonly _audioSourceAddedEvent: WebspeakEvent.Invokable<AudioSource> = WebspeakEvent.create();
    private readonly _audioSourceRemovedEvent: WebspeakEvent.Invokable<AudioSource> = WebspeakEvent.create();
    private readonly _audioProfileAddedEvent: WebspeakEvent.Invokable<AudioProfileAddedEvent> = WebspeakEvent.create();
    private readonly _audioProfileUpdatedEvent: WebspeakEvent.Invokable<AudioProfileUpdateEvent> = WebspeakEvent.create();
    private readonly _audioProfileRemovedEvent: WebspeakEvent.Invokable<AudioProfileRemoveEvent> = WebspeakEvent.create();
    private readonly _connectionResetEvent: WebspeakEvent.Invokable<void> = WebspeakEvent.create();

    private readonly _audioSources:Map<number, AudioSource> = new Map();

    private _isFatal: boolean = false;
    private _rtcConnection?: RTCConnectionWrapper;

    constructor(webspeakConfig: WebspeakConfig) {
        this._webSpeakConfig = webspeakConfig;
    }

    public get webSpeakConfig(): WebspeakConfig {
        return this._webSpeakConfig;
    }

    public get relayURL(): URL {
        return this._webSpeakConfig.relayURL;
    }

    public get sessionId(): string {
        return this._webSpeakConfig.sessionId;
    }

    private async connectRTC(){
        for(let i = 0; i < this.webSpeakConfig.retryAttempts; i++){
            try{
                await this.connectSingle();
                this.rtcConnectionEstablished();
                return;
            }
            catch(error: unknown){
                if(this._isFatal){
                    this._fatalErrorEvent.invoke(error);
                    return;
                }
            }
        }
        this._isFatal = true;
        this._fatalErrorEvent.invoke(new Error("Could not connect. Exceeded maximum number of retries."));
    }

    /**
     * Tries to connect and set the RTC connection to the server over the relay using websockets.
     * @returns A promise which resolves when completed and rejects if an error occurred in the handshake.
     * <p>The boolean value is true if the connection succeeded and false otherwise</p>
     * @private
     */
    private connectSingle(): Promise<void>{
        return new Promise<void>((resolve, reject) => {
            const url = new URL(this.relayURL);
            url.searchParams.append("id", this.sessionId);
            const relayConnection: WebSocket = new WebSocket(url);

            const pendingCandidates: RTCIceCandidateInit[] = [];
            let hasNotResolved: boolean = true;
            let attemptedRtcCon: RTCConnectionWrapper | undefined;

            relayConnection.onclose = (event: CloseEvent) => {
                if(!event.wasClean){
                    console.error("Relay connection closed uncleanly", event);
                } else {
                    console.log("Relay connection closed", event);
                }
                if(hasNotResolved){
                    hasNotResolved = false;
                    if(event.code === 1002 || event.code === 1008){
                        this._isFatal = true;
                    }
                    reject(new Error("Websocket connection error"));
                }
            }

            relayConnection.onerror = (event: Event) => {
                console.error("Error in relay connection", event)
            }

            relayConnection.onmessage = async (event: MessageEvent) => {
                try {
                    const message: any = JSON.parse(event.data);
                    console.log("received message from websocket relay", message);

                    switch (message.type) {
                        case RTCSignalingMessages.iceCandidate.TYPE: {
                            const candidateInfo: RTCIceCandidateInit = {
                                candidate: message.spd,
                                sdpMid: message.sdpMiddle,
                                sdpMLineIndex: message.sdpAgainMLineIndex,
                            };
                            if (attemptedRtcCon === undefined || attemptedRtcCon.rtcConnection.remoteDescription === null) {
                                pendingCandidates.push(candidateInfo);
                            } else {
                                try {
                                    await attemptedRtcCon.rtcConnection.addIceCandidate(candidateInfo);
                                } catch (error) {
                                    console.error("Relay connection error adding ice candidate", error);
                                }
                            }
                            break;
                        }
                        case RTCSignalingMessages.sessionDescription.TYPE: {
                            const remoteDesc: RTCSignalingMessages.sessionDescription = new RTCSignalingMessages.sessionDescription(message.RTCSdpType, message.sdp);
                            //Create the RTC connection if we don't have one yet
                            if (attemptedRtcCon === undefined) {
                                attemptedRtcCon = new RTCConnectionWrapper(this.webSpeakConfig.rtcConfiguration);

                                //send local ice candidates
                                attemptedRtcCon.rtcConnection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
                                    if (event.candidate !== null) {
                                        if (relayConnection.readyState === WebSocket.OPEN) {
                                            const candidatePacket: RTCSignalingMessages.iceCandidate = new RTCSignalingMessages.iceCandidate(
                                                event.candidate.sdpMid,
                                                event.candidate.sdpMLineIndex,
                                                event.candidate.candidate
                                            )
                                            if (hasNotResolved) {
                                                relayConnection.send(RTCSignalingMessages.write(candidatePacket));
                                            }
                                        } else {
                                            console.error("Could not send local candidate because web socket was not open")
                                        }
                                    }
                                };

                                //handle connection state of RTC connection. This is the only way to succeed the promise
                                const onConnectionStateChange = () => {
                                    if (attemptedRtcCon?.rtcConnection.connectionState === "connected") {
                                        attemptedRtcCon?.rtcConnection.removeEventListener("connectionstatechange", onConnectionStateChange);
                                        if (hasNotResolved) {
                                            hasNotResolved = false;
                                            relayConnection.close();
                                            this._rtcConnection = attemptedRtcCon;
                                            resolve();
                                        }
                                    } else if (attemptedRtcCon?.rtcConnection.connectionState === "failed" || attemptedRtcCon?.rtcConnection.connectionState === "closed") {
                                        attemptedRtcCon?.rtcConnection.removeEventListener("connectionstatechange", onConnectionStateChange);
                                        console.error("Connection state change failed");
                                        if (hasNotResolved) {
                                            hasNotResolved = false;
                                            relayConnection.close();
                                            reject(new Error("Connection state change failed"));
                                        }
                                    }
                                };

                                attemptedRtcCon.rtcConnection.addEventListener("connectionstatechange", onConnectionStateChange);
                            } else {
                                console.log("Relay connection Appending new remote session description");
                            }

                            //set the remote description
                            try {
                                await attemptedRtcCon?.rtcConnection.setRemoteDescription({
                                    type: remoteDesc.getRTCSdpType(),
                                    sdp: remoteDesc.sdp,
                                });

                                //add pending ice candidates
                                for (const candidate of pendingCandidates) {
                                    try {
                                        await attemptedRtcCon?.rtcConnection.addIceCandidate(candidate);
                                    } catch (error) {
                                        console.error("Relay connection error adding ice candidate", error);
                                    }
                                }

                                //generate and send answer
                                try {
                                    const answer: RTCSessionDescriptionInit = await attemptedRtcCon?.rtcConnection.createAnswer();

                                    try {
                                        await attemptedRtcCon?.rtcConnection.setLocalDescription(answer);

                                        if (relayConnection.readyState === WebSocket.OPEN) {
                                            const answerPacket: RTCSignalingMessages.sessionDescription = new RTCSignalingMessages.sessionDescription(
                                                RTCSignalingMessages.sessionDescription.parseRTCSdpType(answer.type), answer.sdp
                                            );
                                            if (hasNotResolved) {
                                                relayConnection.send(RTCSignalingMessages.write(answerPacket));
                                            }
                                        } else {
                                            console.error("Could not send answer since websocket was not open");
                                            if (hasNotResolved) {
                                                hasNotResolved = false;
                                                this._isFatal = true;
                                                relayConnection.close();
                                                reject(new Error("Much like heavier-than-air human flight, you have managed to reach what was thought to be an unreachable state. Good job!"));
                                            }
                                        }
                                    } catch (error: unknown) {
                                        console.error("Relay connection Could not set local description", error);
                                        if (hasNotResolved) {
                                            hasNotResolved = false;
                                            relayConnection.close();
                                            reject(new Error("Relay connection failed to set local description"));
                                        }
                                    }
                                } catch (error: unknown) {
                                    console.error("Relay connection Could not generate answer", error);
                                    if (hasNotResolved) {
                                        hasNotResolved = false;
                                        relayConnection.close();
                                        reject(new Error("Relay connection failed to generate answer"));
                                    }
                                }
                            } catch (error: unknown) {
                                console.error("Relay connection could not set remote description", error);
                                if (hasNotResolved) {
                                    hasNotResolved = false;
                                    relayConnection.close();
                                    reject(new Error("Relay connection failed to set remote description"));
                                }
                            }
                            break;
                        }
                        default: {
                            console.error("Received unknown relay message type");
                        }
                    }
                } catch(error: unknown) {
                    console.error("Could not parse JSON from websocket on server", error);
                    if(hasNotResolved){
                        hasNotResolved = false;
                        this._isFatal = true;
                        relayConnection.close();
                        reject(new Error("Invalid JSON"));
                    }
                }
            }
        });
    }

    /**
     * Stop the client.
     *
     * @return A promise that completes once the client has fully stopped.
     */
    /*close(): Promise<any>{
        throw new Error("Not Yet Implemented");
    }*/

    /**
     * ticks the client, in order to do events like send keep alives, etc.
     */
    /*tick(): void {
        throw new Error("Not Yet Implemented");
    }*/

    /**
     * Send a message to the server.
     *
     * @param message   Message payload.
     * @return A promise that completes once the message has been sent.
     */
    /*sendMessage(message: String): Promise<any>{
        throw new Error("Not Yet Implemented");
    }

    /**
     * Called whenever a message is received from the server that is not handled automatically.
     */
    /*getOnMessageReceived(): WebspeakEvent<String> {
        throw new Error("Not Yet Implemented");
    }*/

    /**
     * Called when the internal connection has closed.
     */
    /*public get onClose(): WebspeakEvent<DisconnectEvent>{
        throw new Error("Not Yet Implemented");
    }*/

    private rtcConnectionEstablished(): void{
        if(this._rtcConnection === undefined){
            this._isFatal = true;
            this._fatalErrorEvent.invoke(new Error("We've reached an unreachable state. Anything is possible. The limits were in our heads all along. Follow your dreams. https://xkcd.com/2200/"));
            return;
        }
        const thisCon: RTCConnectionWrapper = this._rtcConnection;
        const onConnectionStateChange = () => {
            if (thisCon.rtcConnection.connectionState === "failed" || thisCon.rtcConnection.connectionState === "closed") {
                this.connectRTC();
            }
        };
        thisCon.rtcConnection.addEventListener("iceconnectionstatechange", onConnectionStateChange);

        thisCon.onReliablePacketReceived.addListener((event: string) => {
            try {
                const message: any = JSON.parse(event);
                console.log("received message from websocket relay", message);

                switch (message.type) {
                    case RTCSignalingMessages.iceCandidate.TYPE: {
                        const candidateInfo: RTCIceCandidateInit = {
                            candidate: message.spd,
                            sdpMid: message.sdpMiddle,
                            sdpMLineIndex: message.sdpAgainMLineIndex,
                        };
                        (async () => {
                            try {
                                await thisCon.rtcConnection.addIceCandidate(candidateInfo);
                            } catch (error) {
                                console.error("Relay connection error adding ice candidate", error);
                            }
                        })();
                        break;
                    }
                    case RTCSignalingMessages.sessionDescription.TYPE: {
                        const remoteDesc: RTCSignalingMessages.sessionDescription = new RTCSignalingMessages.sessionDescription(message.RTCSdpType, message.sdp);
                        (async () => {
                            try {
                                await thisCon.rtcConnection.setRemoteDescription({
                                    type: remoteDesc.getRTCSdpType(),
                                    sdp: remoteDesc.sdp,
                                });

                                //generate and send answer
                                try {
                                    const answer: RTCSessionDescriptionInit = await thisCon.rtcConnection.createAnswer();

                                    try {
                                        await thisCon.rtcConnection.setLocalDescription(answer);

                                        if (thisCon.isOpen()) {
                                            const answerPacket: RTCSignalingMessages.sessionDescription = new RTCSignalingMessages.sessionDescription(
                                                RTCSignalingMessages.sessionDescription.parseRTCSdpType(answer.type), answer.sdp
                                            );
                                            thisCon.sendReliablePacket(RTCSignalingMessages.write(answerPacket));
                                        } else {
                                            console.error("Could not send answer from reliable connection channel");
                                        }
                                    } catch (error: unknown) {
                                        console.error("Could not set local description from reliable connection channel", error);
                                    }
                                } catch (error: unknown) {
                                    console.error("could not generate answer from reliable connection channel", error);
                                }
                            } catch (error: unknown) {
                                console.error("Could not set remote description from reliable connection channel", error);
                            }
                        })();
                        break;
                    }
                    case ReliableMessages.addAudioSource.TYPE: {
                        const addAudioPacket: ReliableMessages.addAudioSource = new ReliableMessages.addAudioSource(message.id, message.config, message.pos);
                        const audioSource: AudioSource = new AudioSource(addAudioPacket.id);
                        if (addAudioPacket.config) {
                            audioSource.setAudioSourceConfig(AudioSource.Config.fromJson(addAudioPacket.config));
                        }
                        if (addAudioPacket.pos) {
                            const initialPos: Vec3d = Vec3d.fromJson(addAudioPacket.pos);
                            audioSource.setPos(initialPos);
                        }
                        this._audioSources.set(audioSource.id, audioSource);
                        this._audioSourceAddedEvent.invoke(audioSource);
                        break;
                    }
                    case ReliableMessages.removeAudioSource.TYPE: {
                        const removeAudioPacket: ReliableMessages.removeAudioSource = new ReliableMessages.removeAudioSource(message.id);
                        const audioSource: AudioSource | undefined = this._audioSources.get(removeAudioPacket.id)
                        if (audioSource) {
                            this._audioSources.delete(removeAudioPacket.id);
                            this._audioSourceRemovedEvent.invoke(audioSource);
                        }
                        break;
                    }
                    case ReliableMessages.addAudioProfile.TYPE: {
                        const audioProfile: ReliableMessages.addAudioProfile = new ReliableMessages.addAudioProfile(message.id, message.uid, message.name);

                        break;
                    }
                    default: {
                        console.error("Received unknown reliable channel message type", message.type);
                    }
                }
            }
            catch (error: unknown)
            {
                console.error("Failed to parse JSON from reliable connection channel", error);
            }
        });
    }

    /**
     * Gets the audio source from the map using an audio source id
     * @param id the id of the aduio source
     */
    public getAudioSource(id: number): AudioSource | undefined{
        return this._audioSources.get(id);
    }

    /**
     * Trys to set the audio track of the connection to the server
     * @param track The track to set it to. ```null``` to clear
     */
    public async setMic(track: MediaStreamTrack | null){
        if(this._rtcConnection !== undefined && this._rtcConnection.isOpen()){
            return this._rtcConnection.setMicTrack(track);
        }
        throw new Error("RTC connection not open");
    }

    /**
     * Called when an error is thrown that the client can not recover from.
     * <p>Most likely the data being returned is an Error but since javascript
     * is dumb you have to check that yourself</p>
     */
    public get onFatalError(): WebspeakEvent<unknown>{
        return this._fatalErrorEvent;
    }

    /**
     * Called when an audio source is added to the connection
     */
    public get onAudioSourceAdded(): WebspeakEvent<AudioSource>{
        return this._audioSourceAddedEvent;
    }

    /**
     * Called when an audio source is added from the connection
     */
    public get onAudioSourceRemoved(): WebspeakEvent<AudioSource>{
        return this._audioSourceRemovedEvent;
    }

    /**
     * Called whenever the server sends a new audio profile
     */
    public get onAudioProfileAdded(): WebspeakEvent<AudioProfileAddedEvent>{
        return this._audioProfileAddedEvent;
    }

    /**
     * Called whenever the server updates an audio profile's audio source id
     */
    public get onAudioProfileUpdated(): WebspeakEvent<AudioProfileUpdateEvent>{
        return this._audioProfileUpdatedEvent;
    }

    /**
     * Called whenever the server requests to remove an audio profile
     */
    public get onAudioProfileRemoved(): WebspeakEvent<AudioProfileRemoveEvent>{
        return this._audioProfileRemovedEvent;
    }

    /**
     * Called when connection automatically reset. All previously created audio sources and audio profiles are no longer valid after this
     */
    public get onConnectionReset(): WebspeakEvent<void>{
        return this._connectionResetEvent;
    }

    /**
     * Get if this client is connected to a webspeak server.
     */
    public get isOpen(): boolean{
        if(!this._rtcConnection || !this._rtcConnection.isOpen()){
            return false;
        }
        return true;
    }
}