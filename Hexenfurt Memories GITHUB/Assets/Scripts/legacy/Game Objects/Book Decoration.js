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
//@input Physics.BodyComponent bookBody
/** @type {BodyComponent} */
var bookBody = script.bookBody;

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

    bookInteractable.onTriggerStart.add(() => {
        script.getSceneObject().getParent().getComponent("Component.ScriptComponent").bookMoved();
        bookBody.dynamic = true;
        bookInteractable.release();
        bookOutline.enabled = false;
    });
    // bookInteractable.onTriggerEnd.add(() => {
    //     bookBody.dynamic = true;
    // });
})