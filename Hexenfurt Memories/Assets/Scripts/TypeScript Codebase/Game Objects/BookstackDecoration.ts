// Decorative stack of physics books. bookMoved() lets any child book topple the
// stack.

import { cloneMaterialForDebrisFade, fadeMaterialsAndDestroy } from "./PhysicsDebrisFade";

@component
export class BookstackDecoration extends BaseScriptComponent {
    private static readonly SETTLE_SEC = 2;

    @input
    public physicsBook!: ObjectPrefab;

    @input
    @label("Push Object")
    @hint("Collider or plate moved upward to knock dynamic books off the stack.")
    public pushObject!: SceneObject;

    @input
    @label("Travel Units")
    @hint("World Y distance the push object moves upward.")
    public travelUnits: number = 30;

    @input
    @label("Travel Time")
    @hint("Seconds to complete the upward push motion.")
    public travelTime: number = 0.35;

    public booksToppled: boolean = false;
    private bookBodies: BodyComponent[] = [];
    private bookRoots: SceneObject[] = [];

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => {
            const bookCount = global.utils.rng(4, 7);
            let instances = 0;
            for (let i = 0; i < bookCount; i++) {
                const bookInstance = this.physicsBook.instantiate(this.getSceneObject());
                const sc = bookInstance.getComponent("Component.ScriptComponent") as any;
                if (sc && sc.bookIdText) sc.bookIdText.text = global.utils.rng(1, 9).toString();

                const body = this.getBookBody(bookInstance);
                if (!body) continue;
                body.dynamic = false;
                this.bookBodies.push(body);
                this.bookRoots.push(bookInstance);

                bookInstance.getTransform().setLocalPosition(new vec3(global.utils.rng(-0.1, 0.1) as any, instances * 4, global.utils.rng(-0.1, 0.1) as any));
                bookInstance.getTransform().setLocalScale(new vec3(1, 1, 1));
                bookInstance.getTransform().setLocalRotation(quat.fromEulerAngles(0, global.utils.rng(0, 360), 0));
                instances++;
            }
        });
    }

    public bookMoved = (): void => {
        if (this.booksToppled) return;
        this.booksToppled = true;

        global.persistentStorage.increaseStat("bookstacksToppled");
        global.soundManager.playSpatialSound(this.getSceneObject(), "bookTopple", 1, 1);

        const fadeMaterials: Material[] = [];

        // Physics + interactables first (matches JS) — never block topple on material work.
        for (let i = 0; i < this.bookBodies.length; i++) {
            const body = this.bookBodies[i];
            body.dynamic = true;
            const so = body.getSceneObject();
            const scripts = so.getComponents("Component.ScriptComponent") as any[];
            if (scripts && scripts.length > 0 && typeof scripts[0].release === "function") {
                scripts[0].release();
            }
            if (scripts && scripts.length > 2 && scripts[2]) {
                scripts[2].enabled = false;
            }
        }

        this.pushStackUp();

        for (let i = 0; i < this.bookBodies.length; i++) {
            this.prepareBookFadeMaterials(this.bookBodies[i].getSceneObject(), fadeMaterials);
        }

        global.utils.delay(BookstackDecoration.SETTLE_SEC, () => {
            for (let i = 0; i < this.bookBodies.length; i++) {
                this.bookBodies[i].dynamic = false;
            }
            fadeMaterialsAndDestroy(this, fadeMaterials, this.bookRoots);
        });
    };

    private pushStackUp(): void {
        if (!this.pushObject || this.travelTime <= 0 || this.travelUnits === 0) return;

        const transform = this.pushObject.getTransform();
        const start = transform.getWorldPosition();
        const end = new vec3(start.x, start.y + this.travelUnits, start.z);
        global.utils.animatePosition(this.pushObject, false, end, this.travelTime);
    }

    private getBookBody(bookInstance: SceneObject): BodyComponent | null {
        const first = bookInstance.getChild(0);
        if (!first) return null;
        const onFirst = first.getComponent("Physics.BodyComponent") as BodyComponent;
        if (onFirst) return onFirst;
        const second = first.getChild(0);
        if (!second) return null;
        return second.getComponent("Physics.BodyComponent") as BodyComponent;
    }

    /** Same mesh paths as `Bookstack Decoration.js`, with fallback for updated prefab layout. */
    private prepareBookFadeMaterials(bodySceneObject: SceneObject, out: Material[]): void {
        const meshParent = bodySceneObject.getChild(0);
        if (!meshParent) return;

        let leatherRmv = meshParent.getChild(0)?.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        let pagesRmv = meshParent.getChild(1)?.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;

        if (!leatherRmv || !pagesRmv) {
            const rmvs = meshParent.getComponents("Component.RenderMeshVisual") as RenderMeshVisual[];
            if (rmvs.length >= 2) {
                pagesRmv = rmvs[0];
                leatherRmv = rmvs[1];
            }
        }

        if (pagesRmv) out.push(cloneMaterialForDebrisFade(pagesRmv));
        if (leatherRmv && leatherRmv !== pagesRmv) out.push(cloneMaterialForDebrisFade(leatherRmv));
    }
}
