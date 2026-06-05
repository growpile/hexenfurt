// An "item spot": a slot inside a room object where ProceduralRoom can drop a
// decoration, an inventory item or note, or a lore wrapper.

@typedef
export class ItemSpot {
    @input
    @label("Object Type")
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("Decoration", "deco"),
            new ComboBoxItem("Inventory Item", "item"),
            new ComboBoxItem("Lore Item", "lore"),
            new ComboBoxItem("Both (item or deco)", "both"),
        ])
    )
    objectType: string = "deco";

    @input("int", "0")
    @label("Orientation")
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("Horizontal", 0),
            new ComboBoxItem("Vertical", 1),
        ])
    )
    orientation: number = 0;

    @input
    @label("Locked Slot")
    lockedSlot: boolean = false;

    @input
    origin!: SceneObject;
}
