// Bookshelf puzzle. The drawer unlocks when the books matching a generated digit
// code are pushed out.

import { ItemSpot } from "./ItemSpot";
import { runTestItemSpots } from "./RoomObjectTesting";

const LSTween_BS = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing_BS = require("LSTween.lspkg/TweenJS/Easing").Easing;

interface PuzzleBookScript {
    bookIdText: Text;
    bookPushedOut: boolean;
    movedCallback?: () => void;
}

@component
export class BookshelfRO extends BaseScriptComponent {
    // @ui {"widget":"group_start", "label":"‎<font color='white'>Left Drawer (Locked)</font>"}
    @input
    public drawerLeftInteractable!: ScriptComponent;

    @input
    public drawerLeftOutline!: ScriptComponent;

    @input
    public leftDrawer!: SceneObject;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Right Drawer</font>"}
    @input
    public drawerRightInteractable!: ScriptComponent;

    @input
    public drawerRightOutline!: ScriptComponent;

    @input
    public rightDrawer!: SceneObject;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Books</font>"}
    @input
    public row1BookOrigin!: SceneObject;

    @input
    public row2BookOrigin!: SceneObject;

    @input
    public bookOffset: number = 1.0;

    @input
    public puzzleBook!: ObjectPrefab;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Item Spots</font>"}
    @input
    @label("Spots")
    public itemSpots: ItemSpot[] = [];
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Testing</font>"}
    @input
    public testItems: boolean = false;

    @input
    public testSpot: number = 0;

    @input
    public testItem: number = 0;

    @input
    @allowUndefined
    public keyTestingPrefab: ObjectPrefab | null = null;

    @input
    @allowUndefined
    public noteTestingPrefab: ObjectPrefab | null = null;

    @input
    @allowUndefined
    public decoTestingPrefab: ObjectPrefab | null = null;
    // @ui {"widget":"group_end"}

    public solved: boolean = false;
    public leftDrawerOpened: boolean = false;
    public rightDrawerOpened: boolean = false;

    public allBooks: SceneObject[] = [];
    public password: string = "";
    public chosenIndices: number[] = [];

    private isShaking: boolean = false;
    private leftDrawerRestPos: vec3 | null = null;

    private static readonly MIN_PASS_LENGTH = 3;
    private static readonly MAX_PASS_LENGTH = 6;
    private static readonly NUMBERS = "0123456789";

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => {
            this.testItemSpots();

            (this.drawerLeftInteractable as any).onTriggerEnd.add(() => {
                if (!this.solved) {
                    global.hintSystem.showHint("lockedBookshelfDrawer");
                    global.soundManager.playSpatialSound(this.getSceneObject(), "woodLocked", 1, 1);
                    this.shakeDrawer();
                    return;
                }
                if (this.leftDrawerOpened) return;
                this.leftDrawerOpened = true;

                (this.drawerLeftInteractable as any).release();
                (this.drawerLeftInteractable as any).getSceneObject().getComponent("Physics.BodyComponent").enabled = false;
                this.drawerLeftOutline.enabled = false;
                global.soundManager.playSpatialSound(this.getSceneObject(), "drawerOpen", 1, 1);
                if (this.itemSpots[0]) this.itemSpots[0].origin.enabled = true;
                this.openDrawer(this.leftDrawer, this.leftDrawer.getTransform(), () => print("Drawer Unlocked!"));
            });

            (this.drawerRightInteractable as any).onTriggerEnd.add(() => {
                if (this.rightDrawerOpened) return;
                this.rightDrawerOpened = true;

                (this.drawerRightInteractable as any).release();
                (this.drawerRightInteractable as any).getSceneObject().getComponent("Physics.BodyComponent").enabled = false;
                this.drawerRightOutline.enabled = false;
                global.soundManager.playSpatialSound(this.getSceneObject(), "drawerOpen", 1, 1);
                this.openDrawer(this.rightDrawer, this.rightDrawer.getTransform(), () => print("Drawer Opened!"));
            });
        });
    }

    public init = (): string => {
        const r1Length = global.utils.rng(3, 5);
        const r2Length = global.utils.rng(2, 3);
        const totalBooks = r1Length + r2Length;

        const maxAllowed = Math.min(BookshelfRO.MAX_PASS_LENGTH, totalBooks - 1);
        const passLength = global.utils.rng(BookshelfRO.MIN_PASS_LENGTH, maxAllowed);

        const allDigits: string[] = [];
        for (let i = 0; i < 10; i++) allDigits.push(BookshelfRO.NUMBERS.charAt(i));

        for (let i = allDigits.length - 1; i > 0; i--) {
            const j = global.utils.rng(0, i);
            const temp = allDigits[i]; allDigits[i] = allDigits[j]; allDigits[j] = temp;
        }

        let password = "";
        for (let i = 0; i < passLength; i++) password += allDigits[i];
        print("Bookshelf code is: " + password);

        const allBooks: SceneObject[] = [];

        for (let r1 = 0; r1 < r1Length; r1++) {
            const newBook = this.puzzleBook.instantiate(this.row1BookOrigin);
            const t = newBook.getTransform();
            const p = t.getLocalPosition();
            t.setLocalPosition(new vec3(p.x, p.y, p.z - this.bookOffset * r1));
            allBooks.push(newBook);
        }
        for (let r2 = 0; r2 < r2Length; r2++) {
            const newBook = this.puzzleBook.instantiate(this.row2BookOrigin);
            const t = newBook.getTransform();
            const p = t.getLocalPosition();
            t.setLocalPosition(new vec3(p.x, p.y, p.z - this.bookOffset * r2));
            allBooks.push(newBook);
        }

        const total = allBooks.length;

        const availableIndices: number[] = [];
        for (let i = 0; i < total; i++) availableIndices.push(i);
        for (let i = availableIndices.length - 1; i > 0; i--) {
            const j = global.utils.rng(0, i);
            const temp = availableIndices[i]; availableIndices[i] = availableIndices[j]; availableIndices[j] = temp;
        }

        const chosenIndices: number[] = [];
        for (let i = 0; i < passLength; i++) chosenIndices.push(availableIndices[i]);
        chosenIndices.sort((a, b) => a - b);

        const fillerDigits: string[] = [];
        for (let i = passLength; i < allDigits.length; i++) fillerDigits.push(allDigits[i]);

        const charSequence: string[] = [];
        let passIdx = 0, fillerIdx = 0;

        for (let i = 0; i < total; i++) {
            let isPasswordIndex = false;
            for (let j = 0; j < chosenIndices.length; j++) {
                if (i === chosenIndices[j]) { isPasswordIndex = true; break; }
            }
            if (isPasswordIndex && passIdx < password.length) {
                charSequence.push(password.charAt(passIdx++));
            } else {
                charSequence.push(fillerIdx < fillerDigits.length ? fillerDigits[fillerIdx++] : "0");
            }
        }

        const callback = (): void => this.onBookMoved();
        for (let i = 0; i < allBooks.length; i++) {
            const sc = allBooks[i].getComponent("Component.ScriptComponent") as unknown as PuzzleBookScript;
            let char = charSequence[i];
            if (char == null) char = "0";
            sc.bookIdText.text = String(char);
            sc.bookPushedOut = false;
            sc.movedCallback = callback;
        }

        this.solved = false;
        this.allBooks = allBooks;
        this.password = password;
        this.chosenIndices = chosenIndices;
        return password;
    };

    private onBookMoved(): void {
        const allBooks = this.allBooks;
        const password = this.password;
        const chosen = this.chosenIndices;

        const pushed: number[] = [];
        for (let i = 0; i < allBooks.length; i++) {
            const sc = allBooks[i].getComponent("Component.ScriptComponent") as unknown as PuzzleBookScript;
            if (sc.bookPushedOut) pushed.push(i);
        }

        const wrong: number[] = [];
        for (let i = 0; i < pushed.length; i++) {
            let isChosen = false;
            for (let j = 0; j < chosen.length; j++) {
                if (pushed[i] === chosen[j]) { isChosen = true; break; }
            }
            if (!isChosen) wrong.push(pushed[i]);
        }
        if (wrong.length > 0) {
            print("Wrong book(s) pushed out: " + wrong.join(", "));
            return;
        }

        const missing: number[] = [];
        for (let i = 0; i < chosen.length; i++) {
            let isPushed = false;
            for (let j = 0; j < pushed.length; j++) {
                if (chosen[i] === pushed[j]) { isPushed = true; break; }
            }
            if (!isPushed) missing.push(chosen[i]);
        }
        if (missing.length > 0) {
            let prog = "";
            for (let i = 0; i < chosen.length; i++) {
                const sc = allBooks[chosen[i]].getComponent("Component.ScriptComponent") as unknown as PuzzleBookScript;
                prog += sc.bookPushedOut ? sc.bookIdText.text : "_";
            }
            print("Partial: " + prog + "  → target: " + password);
            return;
        }

        print("Bookshelf drawer unlocked!");
        this.solved = true;
        global.soundManager.playSpatialSound(this.getSceneObject(), "codeSafeUnlock", 1, 1);
        global.persistentStorage.increaseStat("puzzlesSolved");
    }

    private shakeDrawer(): void {
        if (this.isShaking) return;
        this.isShaking = true;
        const t = this.leftDrawer.getTransform();
        if (this.leftDrawerRestPos === null) this.leftDrawerRestPos = t.getLocalPosition();
        const d = 0.4;
        const fwd = new vec3(0, 0, d);
        const back = new vec3(0, 0, -d);
        const rest = this.leftDrawerRestPos;
        const s1 = LSTween_BS.moveFromToLocal(t, rest, rest.add(fwd), 50).easing(Easing_BS.Quadratic.Out);
        const s2 = LSTween_BS.moveFromToLocal(t, rest.add(fwd), rest.add(back), 50).easing(Easing_BS.Quadratic.Out);
        const s3 = LSTween_BS.moveFromToLocal(t, rest.add(back), rest.add(fwd.uniformScale(0.5)), 40).easing(Easing_BS.Quadratic.Out);
        const s4 = LSTween_BS.moveFromToLocal(t, rest.add(fwd.uniformScale(0.5)), rest.add(back.uniformScale(0.5)), 40).easing(Easing_BS.Quadratic.Out);
        const settle = LSTween_BS.moveFromToLocal(t, rest.add(back.uniformScale(0.5)), rest, 60)
            .easing(Easing_BS.Quadratic.Out)
            .onComplete(() => { this.isShaking = false; });
        s1.chain(s2); s2.chain(s3); s3.chain(s4); s4.chain(settle);
        s1.start();
    }

    private openDrawer(_drawerObj: SceneObject, drawerTransform: Transform, callback: () => void): void {
        const startPos = drawerTransform.getLocalPosition();
        const overshoot = new vec3(startPos.x, startPos.y, startPos.z + 10.8);
        const target = new vec3(startPos.x, startPos.y, startPos.z + 10);

        const slide = LSTween_BS.moveFromToLocal(drawerTransform, startPos, overshoot, 450).easing(Easing_BS.Cubic.Out);
        const settle = LSTween_BS.moveFromToLocal(drawerTransform, overshoot, target, 200)
            .easing(Easing_BS.Sinusoidal.InOut)
            .onComplete(callback);
        slide.chain(settle);
        slide.start();
    }

    private testItemSpots(): void {
        runTestItemSpots(this);
    }
}
