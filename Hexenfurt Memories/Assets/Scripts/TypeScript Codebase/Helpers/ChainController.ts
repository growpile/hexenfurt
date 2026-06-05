// Position-based-dynamics chain simulation. The PBD solver and math library are
// untyped vendor modules required at runtime; only the surface used here is typed.

const PBD = require("../../legacy/Helpers/PositionBasedDynamicsModule");
const MathLib = require("../../legacy/Helpers/JSMathLibraryModule").MathLib;

interface Link {
    transform: Transform;
    startRot: any;
    startDir: any | null;
}

@component
export class ChainController extends BaseScriptComponent {
    @input
    public joints: SceneObject[] = [];

    @ui.separator
    @input("int", "1")
    @label("Anchors")
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("First", 1),
            new ComboBoxItem("First And Last", 2),
        ])
    )
    public anchorCount: number = 1;

    @ui.separator
    @input("float", "1.0")
    @widget(new SliderWidget(0.01, 1.0, 0.1))
    public stiffness: number = 1.0;

    @input("int", "0")
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("Rigid", 0),
            new ComboBoxItem("Elastic", 1),
        ])
    )
    public type: number = 0;

    @input("int", "1")
    @widget(new SliderWidget(1, 30, 1))
    public iterations: number = 1;

    @input
    public timeSpeed: number = 1.0;

    @ui.separator
    @input
    public force: vec3 = new vec3(0, -1, 0);

    @input
    public isRelative: boolean = false;

    @input
    @allowUndefined
    @showIf("isRelative", true)
    public relativeTo: SceneObject | null = null;

    @ui.separator
    @input
    public addRotation: boolean = false;

    @ui.separator
    @input
    public useCollider: boolean = false;

    @input
    @allowUndefined
    @showIf("useCollider", true)
    public collider: SceneObject | null = null;

    @input
    @showIf("useCollider", true)
    public colliderForce: number = 0;

    @input
    @showIf("useCollider", true)
    public sizeMutiplier: number = 6.0;

    private points: any[] = [];
    private constraints: any[] = [];
    private links: Link[] = [];
    private relativeToTransform: Transform | null = null;
    private colliderTransform: Transform | null = null;
    private acc: any = null;
    private firstIndex: number = 0;
    private lastIndex: number = 0;

    onAwake(): void {
        this.lastIndex = this.joints.length - 1;
        if (this.checkValid()) this.initialize();
    }

    private checkValid(): boolean {
        if (this.isRelative) {
            if (!this.relativeTo) { print("Warning, please set the RelativeTo sceneobject force is relative to"); return false; }
            this.relativeToTransform = this.relativeTo.getTransform();
        }
        if (this.iterations <= 0) { print("Warning, iteration count should be > 0"); return false; }
        for (let i = 0; i < this.joints.length; i++) {
            if (!this.joints[i]) { print("Warning, some of the chain joints are not set"); return false; }
        }
        if (this.useCollider) {
            if (this.collider) this.colliderTransform = this.collider.getTransform();
            else { print("Warning, Please set collider sphere Scene Object"); return false; }
        }
        return true;
    }

    private initialize(): void {
        for (let i = 0; i < this.joints.length; i++) {
            const transform = this.joints[i].getTransform();
            this.links.push({
                transform,
                startRot: MathLib.quat.fromEngine(transform.getWorldRotation()),
                startDir: null,
            });
            const pos = MathLib.vec3.fromEngine(transform.getWorldPosition());
            let p: any;
            if (i === 0 || (i === this.joints.length - 1 && this.anchorCount === 2)) {
                p = new PBD.Point(0.0, pos);
            } else {
                p = new PBD.Point(1.0, pos);
            }
            this.points.push(p);
        }

        for (let i = 0; i < this.joints.length; i++) {
            if (i > 0) {
                const c = new PBD.Constraint(this.points[i - 1], this.points[i], this.stiffness, this.type === 0);
                this.constraints.push(c);
                this.links[i - 1].startDir = this.points[i].getPosition().sub(this.points[i - 1].getPosition());
            }
            if (i < this.lastIndex && this.anchorCount === 2) {
                const c = new PBD.Constraint(this.points[i + 1], this.points[i], this.stiffness, this.type === 0);
                this.constraints.push(c);
            }
        }

        this.acc = MathLib.vec3.fromEngine(this.force);

        if (this.points.length > 0 && this.iterations > 0) {
            this.createEvent("UpdateEvent").bind(() => this.onUpdate());
        }
    }

    private onUpdate(): void {
        const deltaTime = 0.033;
        const timeSpeed = 33.0 * this.timeSpeed;
        this.updatePhysics(deltaTime, timeSpeed, this.iterations);
        if (this.addRotation) this.applyRotations();
        this.applyPositions();
    }

    private updatePhysics(dt: number, timeSpeed: number, iteration: number): void {
        this.points[this.firstIndex].setPosition(MathLib.vec3.fromEngine(this.links[0].transform.getWorldPosition()));
        if (this.anchorCount === 2) {
            this.points[this.lastIndex].setPosition(MathLib.vec3.fromEngine(this.links[this.lastIndex].transform.getWorldPosition()));
        }
        if (this.isRelative && this.relativeToTransform) {
            this.acc = MathLib.vec3.fromEngine(this.relativeToTransform.getWorldTransform().multiplyDirection(this.force));
        }

        let colliderPos: any = null, colliderRadius = 0;
        if (this.useCollider && this.collider && this.colliderTransform) {
            colliderPos = MathLib.vec3.fromEngine(this.collider.getTransform().getWorldPosition());
            colliderRadius = this.colliderTransform.getWorldScale().x * this.sizeMutiplier;
        }

        for (let i = 1; i < this.points.length; i++) {
            if (this.useCollider && colliderPos) {
                let colliderAcc = vec3.zero();
                const dir = this.points[i].getPosition().sub(colliderPos);
                const dist = dir.length - colliderRadius;
                if (dist < 0) {
                    colliderAcc = dir.normalize().uniformScale(this.colliderForce * (-dist));
                }
                this.points[i].update(dt * timeSpeed, this.acc.add(colliderAcc));
            } else {
                this.points[i].update(dt * timeSpeed, this.acc);
            }
        }
        for (let i = 0; i < iteration; i++) {
            for (const c in this.constraints) {
                this.constraints[c].solve(dt * timeSpeed);
            }
        }
    }

    private applyRotations(): void {
        for (let i = 1; i < this.points.length; i++) {
            const direction = this.points[i].getPosition().sub(this.points[i - 1].getPosition());
            const q = MathLib.quat.rotationFromTo(this.links[i - 1].startDir, direction);
            const newRot = q.multiply(this.links[i - 1].startRot);
            this.links[i - 1].transform.setWorldRotation(MathLib.quat.toEngine(newRot));
        }
    }

    private applyPositions(): void {
        for (let i = 0; i < this.points.length; i++) {
            const worldPos = MathLib.vec3.toEngine(this.points[i].getPosition());
            this.links[i].transform.setWorldPosition(worldPos);
        }
    }
}
