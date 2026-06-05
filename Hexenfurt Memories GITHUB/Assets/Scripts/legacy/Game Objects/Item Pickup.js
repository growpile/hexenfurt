//@input Component.ScriptComponent itemInteractable
/** @type {ScriptComponent} */
var itemInteractable = script.itemInteractable;
//@input Component.ScriptComponent itemManipulation
/** @type {ScriptComponent} */
var itemManipulation = script.itemManipulation;
//@input Component.ScriptComponent itemOutline
/** @type {ScriptComponent} */
var itemOutline = script.itemOutline;
//@input string itemId
/** @type {string} */
var itemId = script.itemId;
//@input bool isNote = false
/** @type {boolean} */
var isNote = script.isNote;
//@input Component.Text noteTextComponent {"showIf":"isNote"}
/** @type {Text} */
var noteTextComponent = script.noteTextComponent;


script.createEvent("OnStartEvent").bind(() => {
    itemInteractable.enabled = false;
    global.utils.delay(0.7, () => {
        itemInteractable.enabled = true;
    });

    itemInteractable.onTriggerEnd.add(function() {
        if(global.inventory.isInspecting) return;
        itemInteractable.release();
        if(itemOutline) itemOutline.enabled = false;
        
        if(isNote) {
            global.inventory.addNote(noteTextComponent.text, script.getSceneObject());
        } else {
            global.inventory.addItem(itemId, script.getSceneObject());
        }
        
    });
});

script.playTween = function() {
    global.tweenManager.startTween(script.getSceneObject(), "item_pickup", function() {
        global.tweenManager.startTween(script.getSceneObject().getChild(0), "orbit");
    });
}