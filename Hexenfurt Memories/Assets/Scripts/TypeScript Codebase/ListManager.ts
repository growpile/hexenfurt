// UIKit ScrollWindow / ScrollBar helper: reset scroll to top and add list items at runtime.

const ScrollWindowModule = require("SpectaclesUIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow");
const ScrollBarModule = require("SpectaclesUIKit.lspkg/Scripts/ScrollBar");
const SCROLL_WINDOW_TYPE_NAME: string = ScrollWindowModule.ScrollWindow.getTypeName();
const SCROLL_BAR_TYPE_NAME: string = ScrollBarModule.ScrollBar.getTypeName();

type ScrollWindowComponent = {
    isInitialized: boolean;
    scrollPosition: vec2;
    scrollPositionNormalized: vec2;
    scrollDimensions: vec2;
    windowSize: vec2;
    vertical: boolean;
    horizontal: boolean;
    isControlledExternally?: boolean;
    readonly onInitialized?: { add: (fn: () => void) => void };
    readonly children: SceneObject[];
    getSceneObject(): SceneObject;
    getVelocity?: () => vec3;
};

type ScrollWindowRuntime = ScrollWindowComponent & {
    isDragging?: boolean;
};

type ScrollBarComponent = {
    initialized: boolean;
    /** Same reference the ScrollBar component uses internally. */
    scrollWindow?: ScrollWindowComponent;
    slider?: {
        initialized: boolean;
        updateCurrentValue: (value: number, shouldAnimate?: boolean) => void;
    };
    updateSliderKnobPosition?: () => void;
};

type ScrollBarRuntime = ScrollBarComponent & {
    isDraggingSlider?: boolean;
};

const SCROLL_VELOCITY_IDLE_THRESHOLD = 0.05;
const SCROLL_EDGE_EPSILON = 0.35;

@component
export class ListManager extends BaseScriptComponent {
    @ui.group_start("<span style='color: #60A5FA;'>Scroll</span>")
    @input
    @label("Scroll Bar")
    @hint("Required. Uses this bar's linked Scroll Window (must match where items are added).")
    public scrollBar!: ScriptComponent;

    @input
    @label("Scroll Window")
    @hint("Fallback only if the Scroll Bar's linked window cannot be read.")
    public scrollWindow!: ScriptComponent;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Layout</span>")
    @input
    @label("List Content Root")
    @hint("Optional. Child under the Scroll Window (e.g. Content). If unset, finds a child named Content.")
    public listContentRoot: SceneObject | null = null;

    @input
    @hint("When enabled, scroll height grows from the stacked heights passed to addItem.")
    public autoUpdateScrollHeight: boolean = true;

    @input
    @hint("Local Y for the first item; each addItem stacks downward by the height you pass.")
    public listStackOriginY: number = 0;

    @input
    @hint("Optional gap (local Y) inserted between stacked items.")
    public listItemGap: number = 0;

    @input
    @hint("Extra scrollable height (local Y) so the scrollbar can leave the center when the list is short.")
    public minScrollOverflowY: number = 1;
    @ui.group_end

    @ui.group_start("<span style='color: #F59E0B;'>Debug</span>")
    @input
    @label("Debug Dynamic Add")
    @hint("When enabled, spawns Debug Add Prefab into the list on an interval.")
    public debugDynamicAdd: boolean = false;

    @input
    @showIf("debugDynamicAdd")
    @label("Debug Add Prefab")
    public debugAddPrefab!: ObjectPrefab;

    @input
    @showIf("debugDynamicAdd")
    @hint("Height (local Y) used for each debug spawn.")
    public debugAddItemHeight: number = 8;

    @input
    @showIf("debugDynamicAdd")
    @hint("Seconds between automatic debug spawns.")
    public debugAddInterval: number = 2;
    @ui.group_end

    private static readonly DEBUG_ADD_DELAY_ID = "listManagerDebugDynamicAdd";

    private scrollReady: boolean = false;
    private listEntries: { item: SceneObject; height: number }[] = [];
    private stackNextY: number = 0;
    private debugAddActive: boolean = false;
    private pendingScrollLayoutRefresh: boolean = false;
    private pinScrollToBottomOnLayout: boolean = false;
    private scrollLayoutFlushBound: boolean = false;

    onAwake(): void {
        this.resetStackCursor();
        this.createEvent("OnStartEvent").bind(() => {
            this.bindScrollWhenReady();
            this.updateDebugDynamicAdd();
        });
        this.createEvent("OnEnableEvent").bind(() => this.updateDebugDynamicAdd());
        this.createEvent("OnDisableEvent").bind(() => this.stopDebugDynamicAdd());
        this.bindScrollLayoutFlushLoop();
    }

    /**
     * Instantiates a prefab into the ScrollWindow content, stacked on local Y by itemHeight.
     * @param itemHeight Local Y extent for this row (controls spacing to the next addItem call).
     * @param resetScrollToTopAfterAdd When false (default), keeps the current scroll position while the list grows.
     * @returns The new list item SceneObject, or null if setup is missing.
     */
    public addItem(itemPrefab: ObjectPrefab, itemHeight: number, resetScrollToTopAfterAdd: boolean = false): SceneObject | null {
        if (!itemPrefab || !this.getScrollWindow()) {
            return null;
        }

        const height = Math.max(0.01, itemHeight);
        const sw = this.getScrollWindow();
        const parent = this.getListContentParent(sw);
        if (!parent) {
            return null;
        }

        const item = itemPrefab.instantiate(parent);

        const tr = item.getTransform();
        const lp = tr.getLocalPosition();
        const visualHalfY = this.getItemVisualHalfHeight(item, height);
        tr.setLocalPosition(new vec3(lp.x, this.stackNextY - visualHalfY, lp.z));

        this.listEntries.push({ item, height });
        this.stackNextY -= height + this.listItemGap;

        if (this.autoUpdateScrollHeight) {
            this.pinScrollToBottomOnLayout = sw ? this.isScrolledToBottom(sw) && !this.isScrolledToTop(sw) : false;
            this.requestScrollLayoutRefresh();
        }

        if (resetScrollToTopAfterAdd) {
            this.pendingScrollLayoutRefresh = false;
            this.pinScrollToBottomOnLayout = false;
            this.refreshScrollDimensions();
            this.resetScrollToTop();
            this.waitForScrollBarSync(0);
        }

        return item;
    }

    /** Removes and destroys all items added through this ListManager. */
    public clearItems(): void {
        for (let i = 0; i < this.listEntries.length; i++) {
            const entry = this.listEntries[i];
            if (entry.item) {
                entry.item.destroy();
            }
        }
        this.listEntries = [];
        this.resetStackCursor();
        this.pendingScrollLayoutRefresh = false;
        if (this.autoUpdateScrollHeight) {
            this.refreshScrollDimensions();
        }
        this.resetScrollToTop();
        this.waitForScrollBarSync(0);
    }

    /** Scroll to list top (knob at top of track). */
    public resetScrollToTop(): void {
        const sw = this.getScrollWindow();
        if (!sw || !sw.isInitialized) {
            return;
        }

        const edges = this.getScrollEdges(sw);
        sw.scrollPosition = this.clampScrollPosition(
            sw,
            new vec2(sw.scrollPosition.x, edges.topEdge)
        );
        this.syncScrollBarFromWindow();
    }

    /** Queues a layout refresh; applies immediately unless the user is scrolling. */
    public requestScrollLayoutRefresh(): void {
        if (this.isUserInteractingWithScroll()) {
            this.pendingScrollLayoutRefresh = true;
            return;
        }
        this.refreshScrollDimensions();
    }

    /** Updates scrollDimensions from stacked content and top-aligns the list content root. */
    public refreshScrollDimensions(): void {
        const sw = this.getScrollWindow();
        if (!sw || !sw.isInitialized) {
            return;
        }

        const pinBottom = this.pinScrollToBottomOnLayout;
        this.pinScrollToBottomOnLayout = false;

        const wasAtTop = this.isScrolledToTop(sw);
        const preserveNormalized = sw.scrollPositionNormalized;
        const dim = sw.scrollDimensions;
        const newDimY = this.getRequiredScrollHeight(sw);

        sw.scrollDimensions = new vec2(dim.x, newDimY);
        this.alignListContentRoot(sw);
        this.relayoutStackedItems();

        const newEdges = this.getScrollEdges(sw);
        let anchoredY = sw.scrollPosition.y;
        if (pinBottom && this.isVerticallyScrollable(sw)) {
            anchoredY = newEdges.bottomEdge;
        } else if (wasAtTop) {
            anchoredY = newEdges.topEdge;
        } else {
            sw.scrollPositionNormalized = preserveNormalized;
            if (!this.isUserInteractingWithScroll()) {
                this.syncScrollBarFromWindow();
            }
            return;
        }
        sw.scrollPosition = this.clampScrollPosition(sw, new vec2(sw.scrollPosition.x, anchoredY));

        if (!this.isUserInteractingWithScroll()) {
            this.syncScrollBarFromWindow();
        }
    }

    private bindScrollLayoutFlushLoop(): void {
        if (this.scrollLayoutFlushBound) {
            return;
        }
        this.scrollLayoutFlushBound = true;
        this.createEvent("LateUpdateEvent").bind(() => this.flushPendingScrollLayout());
    }

    private flushPendingScrollLayout(): void {
        if (!this.pendingScrollLayoutRefresh) {
            return;
        }
        if (this.isUserInteractingWithScroll()) {
            return;
        }
        this.pendingScrollLayoutRefresh = false;
        this.refreshScrollDimensions();
    }

    private isUserInteractingWithScroll(): boolean {
        const sw = this.getScrollWindow() as ScrollWindowRuntime | null;
        if (!sw || !sw.isInitialized) {
            return false;
        }

        if (sw.isControlledExternally) {
            return true;
        }

        if (sw.isDragging) {
            return true;
        }

        const velocity = sw.getVelocity?.();
        if (velocity && velocity.length > SCROLL_VELOCITY_IDLE_THRESHOLD) {
            return true;
        }

        const bar = this.getScrollBar() as ScrollBarRuntime | null;
        if (bar?.isDraggingSlider) {
            return true;
        }

        return false;
    }

    /**
     * Scroll travel = scrollDimensions.y - windowSize.y.
     * Use viewport + stacked row heights so extra empty scroll area does not grow at the bottom.
     */
    private getRequiredScrollHeight(sw: ScrollWindowComponent): number {
        const win = sw.windowSize.y;
        const overflow = Math.max(0, this.minScrollOverflowY);
        const span = this.getContentScrollSpan();
        if (span <= 0) {
            return win + overflow;
        }
        return win + span + overflow;
    }

    /** Sum of row heights (and gaps); matches how items are actually stacked. */
    private getContentScrollSpan(): number {
        return this.getStackedContentHeight();
    }

    /**
     * Places the list content root so the first row top (listStackOriginY) lines up with
     * the viewport top when scroll is at topEdge (UIKit visible top = dim/2 in parent space).
     */
    private alignListContentRoot(sw: ScrollWindowComponent): void {
        const root = this.getListContentParent(sw);
        if (!root) {
            return;
        }
        const dim = sw.scrollDimensions.y;
        const win = sw.windowSize.y;
        const topY = dim - win * 0.5 - this.listStackOriginY;
        const pos = root.getTransform().getLocalPosition();
        root.getTransform().setLocalPosition(new vec3(pos.x, topY, pos.z));
    }

    /** UIKit rows are center-anchored; stack Y is the row top edge, not the transform origin. */
    private getItemVisualHalfHeight(item: SceneObject, rowHeight: number): number {
        const scripts = item.getComponents("Component.ScriptComponent") as ScriptComponent[];
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as { size?: vec3; _size?: vec3 };
            if (script.size && script.size.y > 0.001) {
                return script.size.y * 0.5;
            }
            if (script._size && script._size.y > 0.001) {
                return script._size.y * 0.5;
            }
        }

        const screenTransform = item.getComponent("Component.ScreenTransform") as ScreenTransform | null;
        if (screenTransform) {
            const anchorHeight = Math.abs(screenTransform.anchors.top - screenTransform.anchors.bottom);
            if (anchorHeight > 0.001) {
                return anchorHeight * 0.5;
            }
        }

        return rowHeight * 0.5;
    }

    private relayoutStackedItems(): void {
        let rowTopY = this.listStackOriginY;
        for (let i = 0; i < this.listEntries.length; i++) {
            const entry = this.listEntries[i];
            if (!entry.item) {
                continue;
            }
            const visualHalfY = this.getItemVisualHalfHeight(entry.item, entry.height);
            const tr = entry.item.getTransform();
            const lp = tr.getLocalPosition();
            tr.setLocalPosition(new vec3(lp.x, rowTopY - visualHalfY, lp.z));
            rowTopY -= entry.height + this.listItemGap;
        }
        this.stackNextY = rowTopY;
    }

    private clampScrollPosition(sw: ScrollWindowComponent, position: vec2): vec2 {
        const edges = this.getScrollEdges(sw);
        let x = position.x;
        let y = position.y;

        if (this.isVerticallyScrollable(sw)) {
            y = Math.min(edges.bottomEdge, Math.max(edges.topEdge, y));
        }

        if (this.isHorizontallyScrollable(sw)) {
            x = Math.min(edges.rightEdge, Math.max(edges.leftEdge, x));
        }

        return new vec2(x, y);
    }

    private resetStackCursor(): void {
        this.stackNextY = this.listStackOriginY;
    }

    private getStackedContentHeight(): number {
        if (!this.listEntries.length) {
            return 0;
        }
        let total = 0;
        for (let i = 0; i < this.listEntries.length; i++) {
            total += this.listEntries[i].height;
        }
        const gaps = Math.max(0, this.listEntries.length - 1) * Math.max(0, this.listItemGap);
        return total + gaps;
    }

    private bindScrollWhenReady(): void {
        const sw = this.getScrollWindow();
        if (!sw) {
            return;
        }

        const onReady = (): void => {
            this.applyInitialScroll();
        };

        if (sw.isInitialized) {
            onReady();
            return;
        }

        const onInit = sw.onInitialized;
        if (onInit && typeof onInit.add === "function") {
            onInit.add(onReady);
            return;
        }

        this.waitForScrollWindow(0, onReady);
    }

    private waitForScrollWindow(attempt: number, onReady: () => void): void {
        const sw = this.getScrollWindow();
        if (sw && sw.isInitialized) {
            onReady();
            return;
        }
        if (attempt >= 120) {
            return;
        }
        const defer = this.createEvent("DelayedCallbackEvent");
        defer.bind(() => this.waitForScrollWindow(attempt + 1, onReady));
        defer.reset(0.05);
    }

    private applyInitialScroll(): void {
        if (this.scrollReady) {
            return;
        }
        this.scrollReady = true;
        this.resetStackCursor();
        this.pendingScrollLayoutRefresh = false;
        if (this.autoUpdateScrollHeight) {
            this.refreshScrollDimensions();
        }
        this.resetScrollToTop();
        this.waitForScrollBarSync(0);
    }

    /** ScrollBar's slider inits after ScrollWindow; sync knob without moving scroll. */
    private waitForScrollBarSync(attempt: number): void {
        const bar = this.getScrollBar();
        if (bar && bar.slider && (bar.initialized || bar.slider.initialized)) {
            this.syncScrollBarFromWindow();
            return;
        }
        if (attempt >= 120) {
            this.syncScrollBarFromWindow();
            return;
        }
        const defer = this.createEvent("DelayedCallbackEvent");
        defer.bind(() => this.waitForScrollBarSync(attempt + 1));
        defer.reset(0.05);
    }

    private syncScrollBarFromWindow(): void {
        const bar = this.getScrollBar();
        if (!bar) {
            return;
        }
        if (typeof bar.updateSliderKnobPosition === "function") {
            bar.updateSliderKnobPosition();
        }
    }

    private isScrolledToBottom(sw: ScrollWindowComponent): boolean {
        if (!this.isVerticallyScrollable(sw)) {
            return false;
        }
        const edges = this.getScrollEdges(sw);
        return sw.scrollPosition.y >= edges.bottomEdge - SCROLL_EDGE_EPSILON;
    }

    private isScrolledToTop(sw: ScrollWindowComponent): boolean {
        if (!this.isVerticallyScrollable(sw)) {
            return true;
        }
        const edges = this.getScrollEdges(sw);
        if (sw.scrollPosition.y <= edges.topEdge + SCROLL_EDGE_EPSILON) {
            return true;
        }
        return sw.scrollPositionNormalized.y >= 0.95;
    }

    private getScrollEdges(sw: ScrollWindowComponent): {
        topEdge: number;
        bottomEdge: number;
        rightEdge: number;
        leftEdge: number;
    } {
        const dim = sw.scrollDimensions;
        const win = sw.windowSize;
        return {
            topEdge: dim.y * -0.5 + win.y * 0.5,
            bottomEdge: dim.y * 0.5 - win.y * 0.5,
            rightEdge: dim.x * -0.5 + win.x * 0.5,
            leftEdge: dim.x * 0.5 - win.x * 0.5
        };
    }

    private isVerticallyScrollable(sw: ScrollWindowComponent): boolean {
        return sw.vertical && sw.scrollDimensions.y !== -1 && sw.scrollDimensions.y > sw.windowSize.y + 0.001;
    }

    private isHorizontallyScrollable(sw: ScrollWindowComponent): boolean {
        return sw.horizontal && sw.scrollDimensions.x !== -1 && sw.scrollDimensions.x > sw.windowSize.x + 0.001;
    }

    /**
     * Must be the ScrollWindow wired on the ScrollBar — not a separate inspector slot.
     * (Scene had two ScrollWindows; updating the wrong one left the knob at 0.5.)
     */
    private getScrollWindow(): ScrollWindowComponent | null {
        const bar = this.getScrollBar() as ScrollBarComponent & { scrollWindow?: ScrollWindowComponent };
        const linked = bar?.scrollWindow ?? (this.getScrollBar() as any)?.scrollWindow;
        if (linked) {
            return linked as ScrollWindowComponent;
        }

        if (!this.scrollWindow) {
            return null;
        }
        const so = this.scrollWindow.getSceneObject();
        const comp = (so as any).getComponent(SCROLL_WINDOW_TYPE_NAME);
        if (comp) {
            return comp as unknown as ScrollWindowComponent;
        }
        return this.scrollWindow as unknown as ScrollWindowComponent;
    }

    private getScrollBar(): ScrollBarComponent | null {
        if (!this.scrollBar) {
            return null;
        }
        const so = this.scrollBar.getSceneObject();
        const comp = (so as any).getComponent(SCROLL_BAR_TYPE_NAME);
        if (comp) {
            return comp as unknown as ScrollBarComponent;
        }
        return this.scrollBar as unknown as ScrollBarComponent;
    }

    /**
     * Content holder under ScrollWindow (stays under internal Scroller after init).
     * Do not use ScrollWindow.addObject — it reparents to Scroller and skips this node.
     */
    private getListContentParent(sw: ScrollWindowComponent | null): SceneObject | null {
        const assignedRoot = this.getAssignedListContentRoot();
        if (assignedRoot) {
            return assignedRoot;
        }
        if (sw) {
            const resolved = this.resolveListContentRoot(sw.getSceneObject());
            if (resolved) {
                return resolved;
            }
        }
        if (this.scrollWindow) {
            const resolved = this.resolveListContentRoot(this.scrollWindow.getSceneObject());
            if (resolved) {
                return resolved;
            }
        }
        return null;
    }

    private getAssignedListContentRoot(): SceneObject | null {
        const root = this.listContentRoot;
        if (!root) {
            return null;
        }
        return root;
    }

    private resolveListContentRoot(scrollWindowObject: SceneObject): SceneObject | null {
        const named = this.findChildByName(scrollWindowObject, "Content");
        if (named) {
            return named;
        }

        const scroller = this.findChildByName(scrollWindowObject, "Scroller");
        if (scroller) {
            const scrollerChildren = scroller.children;
            for (let i = 0; i < scrollerChildren.length; i++) {
                const child = scrollerChildren[i];
                if (child.name !== "Scroller") {
                    return child;
                }
            }
        }

        const directChildren = scrollWindowObject.children;
        for (let i = 0; i < directChildren.length; i++) {
            const child = directChildren[i];
            if (child.name !== "Scroller") {
                return child;
            }
        }

        return null;
    }

    private findChildByName(root: SceneObject, name: string): SceneObject | null {
        if (root.name === name) {
            return root;
        }
        const children = root.children;
        for (let i = 0; i < children.length; i++) {
            const found = this.findChildByName(children[i], name);
            if (found) {
                return found;
            }
        }
        return null;
    }

    private updateDebugDynamicAdd(): void {
        if (!this.debugDynamicAdd || !this.debugAddPrefab) {
            this.stopDebugDynamicAdd();
            return;
        }
        if (this.debugAddActive) {
            return;
        }
        this.debugAddActive = true;
        this.scheduleDebugDynamicAdd();
    }

    private stopDebugDynamicAdd(): void {
        this.debugAddActive = false;
        global.utils.invalidateDelay(ListManager.DEBUG_ADD_DELAY_ID);
    }

    private scheduleDebugDynamicAdd(): void {
        if (!this.debugAddActive) {
            return;
        }
        const interval = Math.max(0.1, this.debugAddInterval);
        global.utils.delay(ListManager.DEBUG_ADD_DELAY_ID, interval, () => {
            if (!this.debugAddActive || !this.debugDynamicAdd || !this.debugAddPrefab) {
                return;
            }
            const index = this.listEntries.length;
            const item = this.addItem(this.debugAddPrefab, this.debugAddItemHeight, false);
            if (item) {
                this.applyDebugListItemLabel(item, index);
            }
            this.scheduleDebugDynamicAdd();
        });
    }

    private applyDebugListItemLabel(item: SceneObject, index: number): void {
        const label = index.toString();
        const text = this.findTextComponent(item);
        if (!text) {
            return;
        }
        text.text = label;
        text.getSceneObject().name = label;
    }

    private findTextComponent(root: SceneObject): Text | null {
        const textObject = this.findChildByName(root, "Text");
        if (textObject) {
            const onTextChild = (textObject as any).getComponent("Component.Text") as Text | null;
            if (onTextChild) {
                return onTextChild;
            }
        }
        const onRoot = (root as any).getComponent("Component.Text") as Text | null;
        if (onRoot) {
            return onRoot;
        }
        const children = root.children;
        for (let i = 0; i < children.length; i++) {
            const found = this.findTextComponent(children[i]);
            if (found) {
                return found;
            }
        }
        return null;
    }
}
