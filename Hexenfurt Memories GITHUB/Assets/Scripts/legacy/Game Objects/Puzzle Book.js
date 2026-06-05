//@input Component.Text bookIdText
/** @type {Text} */
var bookIdText = script.bookIdText;
//@input Component.ScriptComponent bookInteractable
/** @type {ScriptComponent} */
var bookInteractable = script.bookInteractable;
//@input Component.ScriptComponent bookManipulation
/** @type {ScriptComponent} */
var bookManipulation = script.bookManipulation;
//@input Component.ScriptComponent bookOutline
/** @type {ScriptComponent} */
var bookOutline = script.bookOutline;
//@input Component.MaterialMeshVisual materialMeshVisual
/** @type {MaterialMeshVisual} */
var materialMeshVisual = script.materialMeshVisual;

script.bookPushedOut = false;
var bookTransform = script.getSceneObject().getTransform();
var initialLocalX = bookTransform.getLocalPosition().x;
script.movedCallback = null;

script.createEvent("OnStartEvent").bind(() => {

    var currentMaterial = materialMeshVisual.getMaterial(0);
    var newMaterial = currentMaterial.clone();
    materialMeshVisual.clearMaterials();
    materialMeshVisual.addMaterial(newMaterial);
    var hueValues = [-163.30, -96.30, 50.20, 154.90, -20.90];
    newMaterial.mainPass.hueValue = hueValues[Math.floor(Math.random() * hueValues.length)];

    bookInteractable.onTriggerEnd.add(function() {

        if(script.bookPushedOut) {
            script.bookPushedOut = false;
            global.soundManager.playSpatialSound(script.getSceneObject(), "bookSlide", 0.5, 1);

            var newPos = new vec3(initialLocalX, bookTransform.getLocalPosition().y, bookTransform.getLocalPosition().z);
            global.utils.animatePosition(script.getSceneObject(), true, newPos, 0.5, function() {
                bookInteractable.enabled = false;
                bookInteractable.enabled = true;
                bookManipulation.enabled = false;
                bookManipulation.enabled = true;
                bookOutline.enabled = false;
                bookOutline.enabled = true;
                bookInteractable.onAwake();
                bookOutline.init();
                materialMeshVisual.getMaterial(0).mainPass.lightnessValue = 14;
                materialMeshVisual.getMaterial(0).mainPass.saturationValue = 10;
            })
        } else {
            script.bookPushedOut = true;
            global.soundManager.playSpatialSound(script.getSceneObject(), "bookSlide", 0.5, 1);


            var newPos = new vec3(bookTransform.getLocalPosition().x + 0.05, bookTransform.getLocalPosition().y, bookTransform.getLocalPosition().z);
            global.utils.animatePosition(script.getSceneObject(), true, newPos, 0.5, function() {
                bookInteractable.enabled = false;
                bookInteractable.enabled = true;
                bookManipulation.enabled = false;
                bookManipulation.enabled = true;
                bookOutline.enabled = false;
                bookOutline.enabled = true;
                bookInteractable.onAwake();
                bookOutline.init();
                materialMeshVisual.getMaterial(0).mainPass.lightnessValue = 24;
                materialMeshVisual.getMaterial(0).mainPass.saturationValue = -40;
            })
        }

        if(script.movedCallback) {
            script.movedCallback();
        }

    })
})