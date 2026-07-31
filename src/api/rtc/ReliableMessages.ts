export namespace ReliableMessages {
    export interface ReliableMessage {
        getType(): string;
    }

    export class addAudioSource implements ReliableMessage{
        public static readonly TYPE: string = "addSrc";

        constructor(public readonly id: number, public readonly config: string | null | undefined, public readonly pos: Array<number> | null | undefined){
            if(pos && pos.length != 3){
                throw new Error("addAudioSource: pos must be 3");
            }
        }

        getType(): string {
            return addAudioSource.TYPE;
        }
    }

    export class removeAudioSource implements ReliableMessage{
        public static readonly TYPE: string = "remvSrc";

        constructor(public readonly id: number) {}

        getType(): string {
            return removeAudioSource.TYPE;
        }
    }

    export class addAudioProfile implements ReliableMessage{
        public static readonly TYPE: string = "addProf";

        constructor(public readonly uid: string, public readonly name: string, public readonly id: number | null | undefined) {}

        getType(): string {
            return addAudioProfile.TYPE;
        }
    }

    export class updateProfileSource implements ReliableMessage{
        public static readonly TYPE: string = "updateProfSrc";

        constructor(public readonly uid: string, public id: number | null | undefined) {
        }

        getType(): string {
            return updateProfileSource.TYPE;
        }
    }

    export class removeAudioProfile implements ReliableMessage{
        public static readonly TYPE: string = "remvProf";

        constructor(public readonly uid: string) {
        }

        getType(): string {
            return removeAudioProfile.TYPE;
        }
    }

    export function write<T extends ReliableMessage>(message: T): string {
        const obj = {
            ...message,
            type: message.getType(),
        };

        return JSON.stringify(obj);
    }
}