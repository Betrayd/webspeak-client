import type {Vec3d} from "./Vec3d.ts";
import {WebspeakEvent} from "./event/Event.ts";

//TODO: This should use an interface and an impl instead of h1 tags that say internal but I'm lazy
export type UpdatePositionEvent = {
    readonly pos: Vec3d;
    readonly rot: Vec3d | undefined;
}
export class AudioSource{
    private readonly _id: number;

    private readonly _positionUpdatedEvent: WebspeakEvent.Invokable<UpdatePositionEvent> = WebspeakEvent.create();
    private readonly _configUpdatedEvent: WebspeakEvent.Invokable<AudioSource.Config> = WebspeakEvent.create();
    private readonly _trackUpdatedEvent: WebspeakEvent.Invokable<MediaStreamTrack> = WebspeakEvent.create();

    private _config: AudioSource.Config = new AudioSource.Config();
    private _audioTrack?: MediaStreamTrack;
    private _pos?: Vec3d;
    private _rot?: Vec3d;

    constructor(id: number){
        this._id = id;
    }

    /**
     * Gets this audio sources id
     */
    public get id(): number{
        return this._id;
    }

    /**
     * Called whenever the server sends an update to the position and rotation, rotation may be ```undefined```
     * <p>The rotation is given as 3 radians for the x y and z rotation of the audio source</p>
     */
    public get onPositionUpdated(): WebspeakEvent<UpdatePositionEvent> {
        return this._positionUpdatedEvent;
    }

    /**
     * Called when the audio source's config is updated by the server
     */
    public get onConfigUpdated(): WebspeakEvent<AudioSource.Config> {
        return this._configUpdatedEvent
    }

    /**
     * Called when the audio source's input stream track is updated by the server. This usually happens shortly after creation
     */
    public get onTrackUpdated(): WebspeakEvent<MediaStreamTrack> {
        return this._trackUpdatedEvent;
    }

    /**
     * Gets the current pos of this audio source. This may have an initial value or be ```undefined``` if the initial position was not sent by the server
     */
    public get pos(): Vec3d | undefined{
        return this._pos;
    }

    /**
     * Gets the current rot of this audio source. This may have an initial value or be ```undefined``` if the initial rotation was not sent by the server
     */
    public get rot(): Vec3d | undefined{
        return this._rot;
    }

    /**
     * gets the audio source config associated with this source
     */
    public get config(): AudioSource.Config{
        return this._config;
    }

    /**
     * Gets the media stream track attached to this audio source. This may stop receiving data at any time
     */
    public get track(): MediaStreamTrack | undefined{
        return this._audioTrack;
    }

    /**
     * <h1>INTERNAL</h1>
     * sets this audio source's current pos without notifying listeners
     * @param pos
     */
    public setPos(pos: Vec3d){
        this._pos = pos;
    }

    /**
     * <h1>INTERNAL</h1>
     * sets this audio source's current rot without notifying listeners
     * @param rot
     */
    public setRot(rot: Vec3d){
        this._rot = rot;
    }

    /**
     * <h1>INTERNAL</h1>
     * sets this audio source's current pos and notifies listeners
     * @param pos
     */
    public updatePos(pos: Vec3d){
        this._pos = pos;
        this._positionUpdatedEvent.invoke({
            pos: pos,
            rot: undefined
        });
    }

    /**
     * <h1>INTERNAL</h1>
     * sets this audio source's current pos and rotation and notifies listeners
     * @param pos
     * @param rot
     */
    public updatePosRot(pos: Vec3d, rot: Vec3d){
        this._pos = pos;
        this._rot = rot;
        this._positionUpdatedEvent.invoke({
            pos: pos,
            rot: rot
        });
    }

    /**
     * <h1>INTERNAL</h1>
     * sets the audio track
     * @param audioTrack
     */
    public setAudioTrack(audioTrack: MediaStreamTrack | undefined){
        this._audioTrack = audioTrack;
    }

    /**
     * <h1>INTERNAL</h1>
     * Sets the audio source config to the one specified
     */
    public setAudioSourceConfig(config: AudioSource.Config){
        this._config = this._config.append(config);
    }
}

export namespace AudioSource {
    export class Config{
        //TODO: come back to this and make it merge the two ones
        public static fromJson(_json: string): AudioSource.Config{
            return new AudioSource.Config();
        }

        //TODO: why does this create a new one? just append to the old one and call it a day
        public append(_other: AudioSource.Config): AudioSource.Config{
            return new AudioSource.Config();
        }
    }
}