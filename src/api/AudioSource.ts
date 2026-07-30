import type {Vec3d} from "./Vec3d.ts";

export class AudioSource{
    private readonly _id: string;

    private _pos?: Vec3d;
    constructor(id: string){
        this._id = id;
    }

    public get id(): string{
        return this._id;
    }

    public get pos(): Vec3d | undefined{
        return this._pos;
    }

    /**
     * <h1>INTERNAL</h1>
     * sets this audio source's current pos
     * @param pos
     */
    public setPos(pos: Vec3d){
        this._pos = pos;
    }
}