//Translated from the java server version of webspeak
export class Vec3d {
    public static fromJson(json: Array<number>): Vec3d{
        if(json.length != 3){
            throw new RangeError("Vec3d: json array length must be 3");
        }
        return new Vec3d(json[0], json[1], json[2]);
    }
    public static fromUint8Array(bytes: Uint8Array, offset: number = 0, littleEndian = false): Vec3d{
        if(offset + 24 > bytes.length){
            throw new RangeError("Vec3d: Not enough bytes");
        }

        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return new Vec3d(view.getFloat64(offset, littleEndian), view.getFloat64(offset + 8, littleEndian), view.getFloat64(offset + 16, littleEndian));
    }

    public readonly x: number;
    public readonly y: number;
    public readonly z: number;

    public static readonly ZERO = new Vec3d(0, 0, 0);
    public static readonly FORWARD = new Vec3d(0, 0, 1);
    public static readonly UP = new Vec3d(0, 1, 0);

    constructor(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    // --- Addition ---
    public add(other: Vec3d): Vec3d;
    public add(scalar: number): Vec3d;
    public add(x: number, y: number, z: number): Vec3d;
    public add(xOrVal: number | Vec3d, y?: number, z?: number): Vec3d {
        if (typeof xOrVal === "object") {
            return new Vec3d(this.x + xOrVal.x, this.y + xOrVal.y, this.z + xOrVal.z);
        }
        if (y !== undefined && z !== undefined) {
            return new Vec3d(this.x + xOrVal, this.y + y, this.z + z);
        }
        return new Vec3d(this.x + xOrVal, this.y + xOrVal, this.z + xOrVal);
    }

    // --- Subtraction ---
    public subtract(other: Vec3d): Vec3d;
    public subtract(scalar: number): Vec3d;
    public subtract(x: number, y: number, z: number): Vec3d;
    public subtract(xOrVal: number | Vec3d, y?: number, z?: number): Vec3d {
        if (typeof xOrVal === "object") {
            return new Vec3d(this.x - xOrVal.x, this.y - xOrVal.y, this.z - xOrVal.z);
        }
        if (y !== undefined && z !== undefined) {
            return new Vec3d(this.x - xOrVal, this.y - y, this.z - z);
        }
        return new Vec3d(this.x - xOrVal, this.y - xOrVal, this.z - xOrVal);
    }

    // --- Multiplication ---
    public mul(other: Vec3d): Vec3d;
    public mul(scalar: number): Vec3d;
    public mul(x: number, y: number, z: number): Vec3d;
    public mul(xOrVal: number | Vec3d, y?: number, z?: number): Vec3d {
        if (typeof xOrVal === "object") {
            return new Vec3d(this.x * xOrVal.x, this.y * xOrVal.y, this.z * xOrVal.z);
        }
        if (y !== undefined && z !== undefined) {
            return new Vec3d(this.x * xOrVal, this.y * y, this.z * z);
        }
        return new Vec3d(this.x * xOrVal, this.y * xOrVal, this.z * xOrVal);
    }

    // --- Division ---
    public divide(other: Vec3d): Vec3d;
    public divide(scalar: number): Vec3d;
    public divide(x: number, y: number, z: number): Vec3d;
    public divide(xOrVal: number | Vec3d, y?: number, z?: number): Vec3d {
        if (typeof xOrVal === "object") {
            return new Vec3d(this.x / xOrVal.x, this.y / xOrVal.y, this.z / xOrVal.z);
        }
        if (y !== undefined && z !== undefined) {
            return new Vec3d(this.x / xOrVal, this.y / y, this.z / z);
        }
        return new Vec3d(this.x / xOrVal, this.y / xOrVal, this.z / xOrVal);
    }

    // --- Length & Distance ---
    public lengthSquared(): number {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    public length(): number {
        return Math.sqrt(this.lengthSquared());
    }

    public distanceToSquared(other: Vec3d): number;
    public distanceToSquared(x: number, y: number, z: number): number;
    public distanceToSquared(xOrVal: number | Vec3d, y?: number, z?: number): number {
        const dx = typeof xOrVal === "object" ? this.x - xOrVal.x : this.x - xOrVal;
        const dy = typeof xOrVal === "object" ? this.y - xOrVal.y : this.y - y!;
        const dz = typeof xOrVal === "object" ? this.z - xOrVal.z : this.z - z!;

        return dx * dx + dy * dy + dz * dz;
    }

    public distanceTo(other: Vec3d): number;
    public distanceTo(x: number, y: number, z: number): number;
    public distanceTo(xOrVal: number | Vec3d, y?: number, z?: number): number {
        if (typeof xOrVal === "object") {
            return Math.sqrt(this.distanceToSquared(xOrVal));
        }
        return Math.sqrt(this.distanceToSquared(xOrVal, y!, z!));
    }

    // --- Vector Products ---
    public dot(other: Vec3d): number;
    public dot(x: number, y: number, z: number): number;
    public dot(xOrVal: number | Vec3d, y?: number, z?: number): number {
        if (typeof xOrVal === "object") {
            return this.x * xOrVal.x + this.y * xOrVal.y + this.z * xOrVal.z;
        }
        return this.x * xOrVal + this.y * y! + this.z * z!;
    }

    public cross(other: Vec3d): Vec3d;
    public cross(x: number, y: number, z: number): Vec3d;
    public cross(xOrVal: number | Vec3d, y?: number, z?: number): Vec3d {
        let x: number, yVal: number, zVal: number;

        if (typeof xOrVal === "object") {
            x = xOrVal.x;
            yVal = xOrVal.y;
            zVal = xOrVal.z;
        } else {
            x = xOrVal;
            yVal = y!;
            zVal = z!;
        }

        const cx = this.y * zVal - this.z * yVal;
        const cy = this.z * x - this.x * zVal;
        const cz = this.x * yVal - this.y * x;

        return new Vec3d(cx, cy, cz);
    }

    public normalize(): Vec3d {
        const len = this.length();
        if (len === 0) {
            throw new Error("Cannot normalize a zero-length vector");
        }
        return new Vec3d(this.x / len, this.y / len, this.z / len);
    }
}