//@input Asset.ObjectPrefab physicsBook
/** @type {ObjectPrefab} */
var physicsBook = script.physicsBook;

var bookBodies = [];

script.booksToppled = false;

var newLeather;
var newPages;
script.bookMoved = function() {
    if(script.booksToppled) return;
    script.booksToppled = true;

    global.persistentStorage.increaseStat("bookstacksToppled");
    global.soundManager.playSpatialSound(script.getSceneObject(), "bookTopple", 1, 1);


    // make all books dynamic
    for(let i = 0; i < bookBodies.length; i++) {
        bookBodies[i].dynamic = true;
        bookBodies[i].getSceneObject().getComponent('Component.ScriptComponent').release();
        bookBodies[i].getSceneObject().getComponents('Component.ScriptComponent')[2].enabled = false;

        leatherRmv = bookBodies[i].getSceneObject().getChild(0).getChild(0).getComponent('Component.RenderMeshVisual');
        pagesRmv = bookBodies[i].getSceneObject().getChild(0).getChild(1).getComponent('Component.RenderMeshVisual');
        
        newLeather = leatherRmv.getMaterial(0).clone();
        leatherRmv.clearMaterials();
        leatherRmv.addMaterial(newLeather);

        newPages = pagesRmv.getMaterial(0).clone();
        pagesRmv.clearMaterials();
        pagesRmv.addMaterial(newPages);

        newLeather.mainPass.opacity = 0.7;
        newPages.mainPass.opacity = 0.7;
    }

    global.utils.delay(2, function() {
        for(let i = 0; i < bookBodies.length; i++) {
            bookBodies[i].dynamic = false;
        }
    })
}

script.createEvent("OnStartEvent").bind(() => {
    var bookCount = global.utils.rng(4,7);
    var instances = 0;
    for(let i = 0; i < bookCount; i++) {
        var bookInstance = physicsBook.instantiate(script.getSceneObject());

        bookInstance.getComponent("Component.ScriptComponent").bookIdText.text = global.utils.rng(1, 9).toString();

        bookInstance.getChild(0).getComponent("Physics.BodyComponent").dynamic = false;
        bookBodies.push(bookInstance.getChild(0).getComponent("Physics.BodyComponent"));
        bookInstance.getTransform().setLocalPosition(new vec3(global.utils.rng(-0.1,0.1), instances*6, global.utils.rng(-0.1,0.1)));
        bookInstance.getTransform().setLocalScale(new vec3(1,1,1));
        bookInstance.getTransform().setLocalRotation(quat.fromEulerAngles(0, global.utils.rng(0,360), 0));
        instances++;
    }
});