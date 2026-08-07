import {WebspeakEvent} from "./event/Event";
import type {WebspeakConfig} from "./WebspeakConfig.ts";
import {RTCSignalingMessages} from "./rtc/signaling/RTCSignalingMessages.ts";
import {RTCConnectionWrapper} from "./rtc/connection/RTCConnectionWrapper.ts";
import {AudioSource, type UpdatePositionEvent} from "./AudioSource.ts";
import {ReliableMessages} from "./rtc/connection/ReliableMessages.ts";
import {Vec3d} from "./Vec3d.ts";
import {UnreliableMessages} from "./rtc/connection/UnreliableMessages.ts";

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

//TODO: wrap each call in packetReceived in a new try catch because currently it states there is an error with json which there just isn't, because it's catching those errors
export class WebSpeakClient {
    private readonly _webSpeakConfig: WebspeakConfig;

    private readonly _fatalErrorEvent: WebspeakEvent.Invokable<unknown> = WebspeakEvent.create();
    private readonly _rtcConnectedEvent: WebspeakEvent.Invokable<void> = WebspeakEvent.create();
    private readonly _rtcConnectingEvent: WebspeakEvent.Invokable<void> = WebspeakEvent.create();
    private readonly _rtcReadyEvent: WebspeakEvent.Invokable<void> = WebspeakEvent.create();
    private readonly _localPositionUpdatedEvent: WebspeakEvent.Invokable<UpdatePositionEvent> = WebspeakEvent.create();
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

    /**
     * Gets this webspeak client's webspeak config
     */
    public get webSpeakConfig(): WebspeakConfig {
        return this._webSpeakConfig;
    }

    /**
     * Gets the URL from the passed webspeak config
     */
    public get relayURL(): URL {
        return this._webSpeakConfig.relayURL;
    }

    /**
     * Gets the sessionId from the passed webspeak config
     */
    public get sessionId(): string {
        return this._webSpeakConfig.sessionId;
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
     * Called whenever webRTC connects. This may be called again automatically after a connection reset event is called.
     */
    public get onConnected(): WebspeakEvent<void>{
        return this._rtcConnectedEvent;
    }

    /**
     * Called whenever webRTC attempts to connect. This is called after start, but may also be called automatically whenever we attempt to reconnect
     */
    public get onConnecting(): WebspeakEvent<void>{
        return this._rtcConnectingEvent;
    }

    /**
     * Called when the rtc connection guaranteed has all channels and can send and receive data. Things like media input tracks are now able to be set.
     */
    public get onReady(): WebspeakEvent<void>{
        return this._rtcReadyEvent;
    }

    /**
     * Called whenever the server sends an updated local position and rotation. rotation may be ```undefined```
     * <p>The rotation is given as 3 radians for the x y and z rotation of the audio source</p>
     */
    public get onLocalPositionUpdated(): WebspeakEvent<UpdatePositionEvent> {
        return this._localPositionUpdatedEvent;
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
     * <p>uid is expected to be consistent across sessions and can be stored</p>
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
     * Starts the client and attempts to connect to the server
     */
    public start(): void {
        this.connectRTC();
    }

    /**
     * Starts a connection with retries and error handling, and sets up the RTC connection when finished using {@link WebspeakClient#connectSingle|connectSignle} and {@link WebspeakClient#rtcConnectionEstablished|rtcConnectionEstablished}
     * @protected
     */
    protected async connectRTC(){
        for(let i = 0; i < this.webSpeakConfig.retryAttempts; i++){
            try{
                this._rtcConnectingEvent.invoke();
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
    protected connectSingle(): Promise<void>{
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
                    const message: unknown = JSON.parse(event.data);
                    console.log("received message from websocket relay", message);

                    if(!ReliableMessages.isReliableMessage(message)) {
                        throw new Error("Message was not of correct type");
                    }
                    switch (message.type) {
                        case RTCSignalingMessages.iceCandidate.TYPE: {
                            const iceMessage = message as RTCSignalingMessages.iceCandidate;
                            const candidateInfo: RTCIceCandidateInit = {
                                candidate: iceMessage.sdp,
                                sdpMid: iceMessage.sdpMid,
                                sdpMLineIndex: iceMessage.sdpMLineIndex,
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
                            const remoteDesc: RTCSignalingMessages.sessionDescription = message as RTCSignalingMessages.sessionDescription;
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
                                                console.log("sending ice candidate over the relay", candidatePacket);
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
                                        console.log("rtc connected...");
                                        if (hasNotResolved) {
                                            console.log("rtc resolved");
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
                                await attemptedRtcCon?.setRemoteDescription({
                                    type: RTCSignalingMessages.sessionDescription.getRTCSdpType(remoteDesc),
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
                                                console.log("sending answer over the relay", answerPacket);
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
                            console.error("Received unknown relay message type", message.type);
                        }
                    }
                } catch(error: unknown) {
                    console.error("Error applying packet from the relay", error);
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
     * Simply called after the connection is established in {@link WebspeakClient#connectRTC|connectRTC}
     * @protected
     */
    protected rtcConnectionEstablished(): void{
        if(this._rtcConnection === undefined){
            this._isFatal = true;
            this._fatalErrorEvent.invoke(new Error("We've reached an unreachable state. Anything is possible. The limits were in our heads all along. Follow your dreams. https://xkcd.com/2200/"));
            return;
        }
        const thisCon: RTCConnectionWrapper = this._rtcConnection;
        const onConnectionStateChange = () => {
            if (thisCon.rtcConnection.connectionState === "failed" || thisCon.rtcConnection.connectionState === "closed") {
                if(thisCon === this._rtcConnection) {
                    this._audioSources.clear();
                    this._connectionResetEvent.invoke();

                    this.connectRTC();
                }
            }
        };
        thisCon.rtcConnection.addEventListener("iceconnectionstatechange", onConnectionStateChange);

        thisCon.onReliablePacketReceived.addListener((event: string) => {
            try {
                const message: unknown = JSON.parse(event);
                console.log("received message from websocket relay", message);

                if(!ReliableMessages.isReliableMessage(message)) {
                    throw new Error("Message was not of correct type");
                }
                switch (message.type) {
                    case RTCSignalingMessages.iceCandidate.TYPE: {
                        const iceMessage = message as RTCSignalingMessages.iceCandidate;
                        const candidateInfo: RTCIceCandidateInit = {
                            candidate: iceMessage.sdp,
                            sdpMid: iceMessage.sdpMid,
                            sdpMLineIndex: iceMessage.sdpMLineIndex,
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
                        const remoteDesc: RTCSignalingMessages.sessionDescription = message as RTCSignalingMessages.sessionDescription;
                        (async () => {
                            try {
                                await thisCon.setRemoteDescription({
                                    type: RTCSignalingMessages.sessionDescription.getRTCSdpType(remoteDesc),
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
                    case ReliableMessages.localPos.TYPE: {
                        const localPos: ReliableMessages.localPos = message as ReliableMessages.localPos;
                        const pos: Vec3d = Vec3d.fromJson(localPos.pos);
                        if(localPos.rot){
                            this._localPositionUpdatedEvent.invoke({
                                pos: pos,
                                rot: Vec3d.fromJson(localPos.rot)
                            })
                        }else{
                            this._localPositionUpdatedEvent.invoke({
                                pos: pos,
                                rot: undefined
                            })
                        }
                        break;
                    }
                    case ReliableMessages.addAudioSource.TYPE: {
                        const addAudioPacket: ReliableMessages.addAudioSource = message as ReliableMessages.addAudioSource;
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
                        const removeAudioPacket: ReliableMessages.removeAudioSource = message as ReliableMessages.removeAudioSource;
                        const audioSource: AudioSource | undefined = this._audioSources.get(removeAudioPacket.id)
                        if (audioSource) {
                            this._audioSources.delete(removeAudioPacket.id);
                            this._audioSourceRemovedEvent.invoke(audioSource);
                        }
                        break;
                    }
                    case ReliableMessages.addAudioProfile.TYPE: {
                        const addProfilePacket: ReliableMessages.addAudioProfile = message as ReliableMessages.addAudioProfile;
                        if(addProfilePacket) {
                            this._audioProfileAddedEvent.invoke({
                                uid: addProfilePacket.uid,
                                name: addProfilePacket.name,
                                id: addProfilePacket.id
                            });
                        }
                        break;
                    }
                    case ReliableMessages.updateProfileSource.TYPE: {
                        const updateProfilePacket: ReliableMessages.updateProfileSource = message as ReliableMessages.updateProfileSource;
                        if(updateProfilePacket) {
                            this._audioProfileUpdatedEvent.invoke({
                                uid: updateProfilePacket.uid,
                                id: updateProfilePacket.id
                            })
                        }
                        break;
                    }
                    case ReliableMessages.removeAudioProfile.TYPE: {
                        const removeProfilePacket: ReliableMessages.removeAudioProfile = message as ReliableMessages.removeAudioProfile;
                        if(removeProfilePacket) {
                            this._audioProfileRemovedEvent.invoke({
                                uid: removeProfilePacket.uid
                            })
                        }
                        break;
                    }
                    default: {
                        console.error("Received unknown reliable channel message type", message.type);
                    }
                }
            }
            catch (error: unknown)
            {
                console.error("Error applying packet from reliable connection channel", error);
            }
        });

        //handle packets from the unreliable channel
        thisCon.onUnreliablePacketReceived.addListener((bytes: Uint8Array) => {
            const message: UnreliableMessages.UnreliableMessage | undefined = UnreliableMessages.parseBytes(bytes);
            let readJson: boolean = false;
            if(message !== undefined) {
                if(message instanceof UnreliableMessages.localPosition){
                    if(message.rot) {
                        this._localPositionUpdatedEvent.invoke({
                            pos: message.pos,
                            rot: message.rot
                        });
                    }
                    else{
                        this._localPositionUpdatedEvent.invoke({
                            pos: message.pos,
                            rot: undefined
                        });
                    }
                    readJson = true;
                }
                else if(message instanceof UnreliableMessages.audioSourcePosition) {
                    const audioSource = this.getAudioSource(message.id);
                    if (audioSource) {
                        if(message.rot) {
                            audioSource.updatePosRot(message.pos, message.rot);
                        }else{
                            audioSource.updatePos(message.pos);
                        }
                    }
                    readJson = true;
                }
            }
            if(!readJson) {
                console.error("Unreliable packet unable to be parsed!", message);
            }
        })

        //add the received track if it's id matches our player id.
        //we don't actually care about removing it again after because if it's not receiving data anymore then it's just silent which is fine
        thisCon.rtcConnection.addEventListener("track", (track: RTCTrackEvent) => {
            const mediaTrack: MediaStreamTrack = track.track;
            const linkedAudioSource: AudioSource | undefined = this._audioSources.get(parseInt(mediaTrack.id));
            if(linkedAudioSource) {
                linkedAudioSource.setAudioTrack(mediaTrack);
            }else{
                console.error("Received media track for unknown audio source", mediaTrack.id);
            }
        });

        thisCon.onReady.addListener(() => {
            this._rtcReadyEvent.invoke();
        })

        this._rtcConnectedEvent.invoke();
    }
}