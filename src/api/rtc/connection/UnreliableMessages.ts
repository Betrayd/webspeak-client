import {Vec3d} from "../../Vec3d.ts";

export namespace UnreliableMessages {
    export interface UnreliableMessage{
        get type(): number;
    }

    export function parseBytes(bytes: Uint8Array): UnreliableMessage | undefined{
        if(bytes.length > 0){
            const type: number = bytes[0];
            switch(type){
                case localPosition.TYPE: {
                    if(bytes.length >= 13){
                        const pos: Vec3d = Vec3d.fromUint8Array(bytes, 1);

                        if(bytes.length === 25){
                            const rot: Vec3d = Vec3d.fromUint8Array(bytes, 14);

                            return new UnreliableMessages.localPosition(pos, rot);
                        }

                        return new UnreliableMessages.localPosition(pos, undefined);
                    }
                    break;
                }
                case audioSourcePosition.TYPE: {
                    if(bytes.length >= 15){
                        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
                        const audioSourceId: number = view.getInt16(1, false);

                        const pos: Vec3d = Vec3d.fromUint8Array(bytes, 3);

                        if(bytes.length === 27){
                            const rot: Vec3d = Vec3d.fromUint8Array(bytes, 16);

                            return new UnreliableMessages.audioSourcePosition(audioSourceId, pos, rot);
                        }
                        return new UnreliableMessages.audioSourcePosition(audioSourceId, pos, undefined);
                    }
                    break;
                }
            }
        }
        return undefined;
    }

    export class localPosition implements UnreliableMessage {
        public static readonly TYPE: number = 1;
        constructor(public readonly pos: Vec3d, public readonly rot: Vec3d | null | undefined) {}

        get type(): number {
            return audioSourcePosition.TYPE;
        }
    }

    export class audioSourcePosition implements UnreliableMessage {
        public static readonly TYPE: number = 2;
        constructor(public readonly id: number, public readonly pos: Vec3d, public readonly rot: Vec3d | null | undefined) {}

        get type(): number {
            return audioSourcePosition.TYPE;
        }
    }
}