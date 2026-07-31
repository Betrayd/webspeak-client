import type {Vec3d} from "./Vec3d.ts";
import {WebspeakEvent} from "./event/Event.ts";

//TODO: This should use an interface and an impl instead of h1 tags that say internal but I'm lazy
export class AudioSource{
    private readonly _id: number;

    private readonly _positionUpdatedEvent: WebspeakEvent.Invokable<Vec3d> = WebspeakEvent.create();
    private readonly _configUpdatedEvent: WebspeakEvent.Invokable<AudioSource.Config> = WebspeakEvent.create();

    private _config: AudioSource.Config = new AudioSource.Config();
    private _audioTrack?: MediaStreamTrack;
    private _pos?: Vec3d;

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
     * Called whenever the server sends an update to the position
     */
    public get onPositionUpdated(): WebspeakEvent<Vec3d> {
        return this._positionUpdatedEvent;
    }

    /**
     * Called when the audio sources config is updated by the server
     */
    public get onConfigUpdated(): WebspeakEvent<AudioSource.Config> {
        return this._configUpdatedEvent
    }

    /**
     * Gets the current pos of this audio source. This may have an initial value or be ```undefined``` if the initial position was not sent by the server
     */
    public get pos(): Vec3d | undefined{
        return this._pos;
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
     * sets this audio source's current pos
     * @param pos
     */
    public setPos(pos: Vec3d){
        this._pos = pos;
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