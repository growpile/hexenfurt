const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

//#region Inputs

// @ui {"widget":"group_start", "label":"‎<font color='white'>Left Drawer (Locked)</font>"}
//@input Component.ScriptComponent drawerLeftInteractable {"label":"Interactable"}
/** @type {ScriptComponent} */
var drawerLeftInteractable = script.drawerLeftInteractable;
//@input Component.ScriptComponent drawerLeftOutline {"label":"Outline"}
/** @type {ScriptComponent} */
var drawerLeftOutline = script.drawerLeftOutline;
//@input SceneObject leftDrawer {"label":"Drawer Object"}
/** @type {SceneObject} */
var leftDrawer = script.leftDrawer;
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Right Drawer</font>"}
//@input Component.ScriptComponent drawerRightInteractable {"label":"Interactable"}
/** @type {ScriptComponent} */
var drawerRightInteractable = script.drawerRightInteractable;
//@input Component.ScriptComponent drawerRightOutline {"label":"Outline"}
/** @type {ScriptComponent} */
var drawerRightOutline = script.drawerRightOutline;
//@input SceneObject rightDrawer {"label":"Drawer Object"}
/** @type {SceneObject} */
var rightDrawer = script.rightDrawer;
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Books</font>"}
//@input SceneObject row1BookOrigin {"label":"Row 1 Origin"}
/** @type {SceneObject} */
var row1BookOrigin = script.row1BookOrigin;
//@input SceneObject row2BookOrigin {"label":"Row 2 Origin"}
/** @type {SceneObject} */
var row2BookOrigin = script.row2BookOrigin;
//@input float bookOffset {"label":"Spacing"}
/** @type {number} */
var bookOffset = script.bookOffset;
//@input Asset.ObjectPrefab puzzleBook {"label":"Puzzle Book Prefab"}
/** @type {ObjectPrefab} */
var puzzleBook = script.puzzleBook;
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Item Spots</font>"}
/*
@typedef itemSpotClass
@property {string} objectType = "deco" {"widget":"combobox", "values":[{"label":"Decoration", "value":"deco"}, {"label":"Inventory Item", "value":"item"}, {"label":"Lore Item", "value":"lore"}, {"label":"Both", "value":"both"}]}
@property {int} orientation = 0 {"widget":"combobox", "values":[{"label":"Horizontal", "value":0}, {"label":"Vertical", "value":1}]}
@property {bool} lockedSlot = false
@property {SceneObject} origin
*/
// @input itemSpotClass[] itemSpots {"label":"Spots"}
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Testing</font>"}
// @input bool testItems = false {"label":"Enable"}
// @input int testSpot = 0 {"showIf":"testItems", "label":"Spot Index"}
// @input int testItem = 0 {"showIf":"testItems", "label":"Item Type", "widget":"combobox", "values":[{"label":"Key", "value":0}, {"label":"Note", "value":1}, {"label":"Decoration", "value":2}]}
// @input Asset.ObjectPrefab keyTestingPrefab {"showIf":"testItems", "label":"Key Prefab"}
// @input Asset.ObjectPrefab noteTestingPrefab {"showIf":"testItems", "label":"Note Prefab"}
// @input Asset.ObjectPrefab decoTestingPrefab {"showIf":"testItems", "label":"Deco Prefab"}
// @ui {"widget":"group_end"}

//#endregion

script.roomObject = {
    itemSpots: script.itemSpots,
    getCodeClue: script.init,
}

function testItemSpots() {
    if(script.testItems) {
        var testingPrefab = script.testItem == 0 ? script.keyTestingPrefab : script.noteTestingPrefab;
        if(script.testItem == 2) {
            testingPrefab = script.decoTestingPrefab;
        }
        var spot = script.itemSpots[script.testSpot];
        var spawnedItem = testingPrefab.instantiate(spot.origin);
        spawnedItem.getTransform().setLocalPosition(vec3.zero());
        spawnedItem.getTransform().setLocalScale(vec3.one());
    }
}

script.solved = false;
var leftDrawerTransform = leftDrawer.getTransform();
var rightDrawerTransform = rightDrawer.getTransform();
script.leftDrawerOpened = false;
script.rightDrawerOpened = false;
var isShaking = false;
var leftDrawerRestPos = null;

function shakeDrawer() {
    if (isShaking) return;
    isShaking = true;
    var t = leftDrawer.getTransform();
    if (leftDrawerRestPos === null) leftDrawerRestPos = t.getLocalPosition();
    var d = 0.4;
    var fwd = new vec3(0, 0, d);
    var back = new vec3(0, 0, -d);
    var s1 = LSTween.moveFromToLocal(t, leftDrawerRestPos, leftDrawerRestPos.add(fwd), 50).easing(Easing.Quadratic.Out);
    var s2 = LSTween.moveFromToLocal(t, leftDrawerRestPos.add(fwd), leftDrawerRestPos.add(back), 50).easing(Easing.Quadratic.Out);
    var s3 = LSTween.moveFromToLocal(t, leftDrawerRestPos.add(back), leftDrawerRestPos.add(fwd.uniformScale(0.5)), 40).easing(Easing.Quadratic.Out);
    var s4 = LSTween.moveFromToLocal(t, leftDrawerRestPos.add(fwd.uniformScale(0.5)), leftDrawerRestPos.add(back.uniformScale(0.5)), 40).easing(Easing.Quadratic.Out);
    var settle = LSTween.moveFromToLocal(t, leftDrawerRestPos.add(back.uniformScale(0.5)), leftDrawerRestPos, 60)
        .easing(Easing.Quadratic.Out)
        .onComplete(function() { isShaking = false; });
    s1.chain(s2);
    s2.chain(s3);
    s3.chain(s4);
    s4.chain(settle);
    s1.start();
}

function openDrawer(drawerObj, drawerTransform, callback) {
    var startPos = drawerTransform.getLocalPosition();
    var overshoot = new vec3(startPos.x, startPos.y, startPos.z + 10.8);
    var target = new vec3(startPos.x, startPos.y, startPos.z + 10);

    var slide = LSTween.moveFromToLocal(drawerTransform, startPos, overshoot, 450).easing(Easing.Cubic.Out);
    var settle = LSTween.moveFromToLocal(drawerTransform, overshoot, target, 200)
        .easing(Easing.Sinusoidal.InOut)
        .onComplete(callback);

    slide.chain(settle);
    slide.start();
}

const MIN_PASS_LENGTH = 3;
const MAX_PASS_LENGTH = 6;
const NUMBERS = "0123456789";

script.createEvent("OnStartEvent").bind(() => {
    testItemSpots();

    drawerLeftInteractable.onTriggerEnd.add(function() {
        if(!script.solved) {
            global.hintSystem.showHint("lockedBookshelfDrawer");
            global.soundManager.playSpatialSound(script.getSceneObject(), "woodLocked", 1, 1);
            shakeDrawer();
            return;
        }
        if(script.leftDrawerOpened) return;
        script.leftDrawerOpened = true;

        drawerLeftInteractable.release();
        drawerLeftInteractable.getSceneObject().getComponent("Physics.BodyComponent").enabled = false;
        drawerLeftOutline.enabled = false;
        global.soundManager.playSpatialSound(script.getSceneObject(), "drawerOpen", 1, 1);
        script.itemSpots[0].origin.enabled = true;
        openDrawer(leftDrawer, leftDrawerTransform, function() {
            print("Drawer Unlocked!");
        });
    })

    drawerRightInteractable.onTriggerEnd.add(function() {
        if(script.rightDrawerOpened) return;
        script.rightDrawerOpened = true;

        drawerRightInteractable.release();
        drawerRightInteractable.getSceneObject().getComponent("Physics.BodyComponent").enabled = false;
        drawerRightOutline.enabled = false;
        global.soundManager.playSpatialSound(script.getSceneObject(), "drawerOpen", 1, 1);
        openDrawer(rightDrawer, rightDrawerTransform, function() {
            print("Drawer Opened!");
        });
    })
})

script.init = function() {
    let r1Length = global.utils.rng(3, 5);
    let r2Length = global.utils.rng(2, 3);
    const totalBooks = r1Length + r2Length;

    const maxAllowed = Math.min(MAX_PASS_LENGTH, totalBooks - 1);
    const passLength = global.utils.rng(MIN_PASS_LENGTH, maxAllowed);

    const allDigits = [];
    for (let i = 0; i < 10; i++) allDigits.push(NUMBERS.charAt(i));

    for (let i = allDigits.length - 1; i > 0; i--) {
        const j = global.utils.rng(0, i);
        const temp = allDigits[i];
        allDigits[i] = allDigits[j];
        allDigits[j] = temp;
    }

    let password = "";
    for (let i = 0; i < passLength; i++) password += allDigits[i];
    print("Bookshelf code is: " + password);

    const allBooks = [];

    for (let r1 = 0; r1 < r1Length; r1++) {
        let newBook = puzzleBook.instantiate(row1BookOrigin);
        let t = newBook.getTransform();
        let p = t.getLocalPosition();
        t.setLocalPosition(new vec3(p.x, p.y, p.z - bookOffset * r1));
        allBooks.push(newBook);
    }
    for (let r2 = 0; r2 < r2Length; r2++) {
        let newBook = puzzleBook.instantiate(row2BookOrigin);
        let t = newBook.getTransform();
        let p = t.getLocalPosition();
        t.setLocalPosition(new vec3(p.x, p.y, p.z - bookOffset * r2));
        allBooks.push(newBook);
    }

    const total = allBooks.length;

    let availableIndices = [];
    for (let i = 0; i < total; i++) availableIndices.push(i);

    for (let i = availableIndices.length - 1; i > 0; i--) {
        const j = global.utils.rng(0, i);
        const temp = availableIndices[i];
        availableIndices[i] = availableIndices[j];
        availableIndices[j] = temp;
    }

    let chosenIndices = [];
    for (let i = 0; i < passLength; i++) chosenIndices.push(availableIndices[i]);
    chosenIndices.sort(function(a, b) { return a - b; });

    let fillerDigits = [];
    for (let i = passLength; i < allDigits.length; i++) fillerDigits.push(allDigits[i]);

    const charSequence = [];
    let passIdx = 0;
    let fillerIdx = 0;

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

    for (let i = 0; i < allBooks.length; i++) {
        const sc = allBooks[i].getComponent("Component.ScriptComponent");
        let char = charSequence[i];
        if (char == null) char = "0";
        sc.bookIdText.text = String(char);
        sc.bookPushedOut = false;
        sc.movedCallback = onBookMoved;
    }

    script.solved = false;
    script.allBooks = allBooks;
    script.password = password;
    script.chosenIndices = chosenIndices;

    return password;
};

function onBookMoved() {
    const allBooks = script.allBooks;
    const password = script.password;
    const chosen = script.chosenIndices;

    let pushed = [];
    for (let i = 0; i < allBooks.length; i++) {
        const sc = allBooks[i].getComponent("Component.ScriptComponent");
        if (sc.bookPushedOut) pushed.push(i);
    }

    let wrong = [];
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

    let missing = [];
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
            const sc = allBooks[chosen[i]].getComponent("Component.ScriptComponent");
            prog += sc.bookPushedOut ? sc.bookIdText.text : "_";
        }
        print("Partial: " + prog + "  → target: " + password);
        return;
    }

    print("Bookshelf drawer unlocked!");
    script.solved = true;
    global.soundManager.playSpatialSound(script.getSceneObject(), "codeSafeUnlock", 1, 1);
    global.persistentStorage.increaseStat("puzzlesSolved");
}
