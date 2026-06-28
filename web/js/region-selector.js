/**
 * FishBowl Security Extension - Region Selector
 * Allows selecting a region on the screen to select all selectable elements within it
 */

/**
 * Class representing a region selector for the FishBowl extension
 */
class FishBowlRegionSelector {
  /**
   * Create a new region selector instance
   */
  constructor() {
    this.isActive = false;
    this.startX = 0;
    this.startY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.selectionElement = null;
    this.hintElement = null;
    this.shortcutsHintElement = null;
    this.justCompletedSelection = false; // Flag to track if selection was just completed

    // Bind event handlers to preserve 'this' context
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
  }

  /**
   * Toggle the region selection mode on/off
   */
  toggleRegionSelectionMode() {
    // Simply toggle region selection without affecting execution mode
    if (this.isActive) {
      this.deactivateRegionSelection();
    } else {
      this.activateRegionSelection();
    }
  }

  /**
   * Activate the region selection mode
   */
  activateRegionSelection() {
    this.isActive = true;

    // Add the active class to the body to show crosshair cursor
    document.body.classList.add('fishbowl-region-selector-active');

    // Create hint element to guide the user
    this.createSelectionHint();

    // Add event listeners for mouse operations
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
  }

  getRegionSelectedElements() {
    if (globalThis.FishBowlShadowDomTools && typeof globalThis.FishBowlShadowDomTools.querySelectorAllDeep === 'function') {
      return globalThis.FishBowlShadowDomTools.querySelectorAllDeep('.fishbowl-region-selected', document);
    }
    return document.querySelectorAll('.fishbowl-region-selected');
  }

  /**
   * Deactivate the region selection mode
   */
  deactivateRegionSelection() {
    if (!this.isActive) return;

    this.isActive = false;

    // Remove active class from body
    document.body.classList.remove('fishbowl-region-selector-active');

    // Remove hint element
    if (this.hintElement) {
      document.body.removeChild(this.hintElement);
      this.hintElement = null;
    }

    // Remove selection element if it exists
    this.removeSelectionElement();

    // Apply exit transition to any highlighted elements
    const highlightedElements = this.getRegionSelectedElements();
    if (highlightedElements.length > 0) {
      // Add exit transition class to enable smooth transition out
      highlightedElements.forEach(el => {
        el.classList.add('fishbowl-region-exiting');
      });

      // Remove highlights after transition completes
      setTimeout(() => {
        this.getRegionSelectedElements().forEach(el => {
          el.classList.remove('fishbowl-region-selected');
          el.classList.remove('fishbowl-region-exiting');
        });
      }, 300);
    }

    // Remove event listeners
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
  }

  /**
   * Cancel the current region selection
   */
  cancelRegionSelection() {
    this.deactivateRegionSelection();
  }

  /**
   * Create a hint element to show the user how to use region selection
   */
  createSelectionHint() {
    // Create hint element if it doesn't exist
    if (!this.hintElement) {
      this.hintElement = document.createElement('div');
      this.hintElement.className = 'fishbowl-region-selection-hint';
      this.hintElement.textContent = 'Click and drag to select a region. Press Escape to cancel.';
      document.body.appendChild(this.hintElement);

      // Fade out the hint after a few seconds
      setTimeout(() => {
        if (this.hintElement) {
          this.hintElement.style.opacity = '0';
          setTimeout(() => {
            if (this.hintElement && this.hintElement.parentNode) {
              document.body.removeChild(this.hintElement);
              this.hintElement = null;
            }
          }, 300);
        }
      }, 3000);
    }
  }

  /**
   * Handle mouse down event to start region selection
   * @param {MouseEvent} event The mouse event
   */
  handleMouseDown(event) {
    if (!this.isActive) return;

    // Store starting coordinates
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.currentX = event.clientX;
    this.currentY = event.clientY;

    // Create the selection element
    this.createSelectionElement();

    // Prevent default behavior to avoid text selection
    event.preventDefault();
  }

  /**
   * Handle mouse move event to update selection rectangle and highlight elements
   * @param {MouseEvent} event The mouse event
   */
  handleMouseMove(event) {
    if (!this.isActive || !this.selectionElement) return;

    // Update current position
    this.currentX = event.clientX;
    this.currentY = event.clientY;

    // Update selection element
    this.updateSelectionElement();

    // Update highlighted elements in real-time as the selection changes
    this.highlightElementsInRegion(this.getSelectionRect());

    // Prevent default behavior
    event.preventDefault();
  }

  /**
   * Highlight elements within the current selection region in real-time
   * @param {Object} rect The selection rectangle with left, top, width, and height
   */
  highlightElementsInRegion(rect) {
    let highlightElements = [];
    if (globalThis.FishBowlShadowDomTools && typeof globalThis.FishBowlShadowDomTools.querySelectorAllDeep === 'function') {
      highlightElements = globalThis.FishBowlShadowDomTools.querySelectorAllDeep('.fishbowl-highlight[data-selectable="true"]', document);
    } else {
      highlightElements = document.querySelectorAll('.fishbowl-highlight[data-selectable="true"]');
    }

    // Get the most numerous type elements using the same method as final selection
    const mostNumerous = this.getMostNumerousTypeInRegion(rect);

    // Create a Set of elements that should be highlighted (only the most numerous type)
    const shouldBeHighlighted = new Set();
    if (mostNumerous.elements.length > 0) {
      mostNumerous.elements.forEach(element => {
        shouldBeHighlighted.add(element);
      });
    }

    // Second pass: add/remove highlight class only when needed
    highlightElements.forEach(element => {
      const shouldHighlight = shouldBeHighlighted.has(element);
      const isCurrentlyHighlighted = element.classList.contains('fishbowl-region-selected');

      if (shouldHighlight && !isCurrentlyHighlighted) {
        // Only add class if it's not already there
        element.classList.add('fishbowl-region-selected');
      } else if (!shouldHighlight && isCurrentlyHighlighted) {
        // Only remove class if it's currently there but shouldn't be
        element.classList.remove('fishbowl-region-selected');
      }
      // If state is already correct, do nothing to avoid resetting animations
    });
  }

  /**
   * Handle mouse up event to finalize selection
   * @param {MouseEvent} event The mouse event
   */
  handleMouseUp(event) {
    if (!this.isActive || !this.selectionElement) return;

    // Get the final selection rectangle
    const rect = this.getSelectionRect();

    // Set flag to prevent immediate selection clearing
    this.justCompletedSelection = true;

    // Select all items within the region
    this.selectItemsInRegion(rect);

    // Clean up selection
    this.removeSelectionElement();
    this.deactivateRegionSelection();

    // Remove any remaining highlights
    this.getRegionSelectedElements().forEach(el => {
      el.classList.remove('fishbowl-region-selected');
    });

    // Disable execution mode if it was active
    if (window.FishBowlUiManager?.executionModeManager?.executionMode) {
      window.FishBowlUiManager.toggleExecutionMode();
    }

    // Clear the protection flag after a short delay
    setTimeout(() => {
      this.justCompletedSelection = false;
    }, 300);

    // Prevent default behavior
    event.preventDefault();
  }

  /**
   * Create the visual selection element
   */
  createSelectionElement() {
    // Remove existing selection element if it exists
    this.removeSelectionElement();

    // Create new selection element
    this.selectionElement = document.createElement('div');
    this.selectionElement.className = 'fishbowl-region-selector';
    document.body.appendChild(this.selectionElement);

    // Set initial position and size
    this.updateSelectionElement();
  }

  /**
   * Update the position and size of the selection element
   */
  updateSelectionElement() {
    if (!this.selectionElement) return;

    const rect = this.getSelectionRect();

    // Update element style
    this.selectionElement.style.left = rect.left + 'px';
    this.selectionElement.style.top = rect.top + 'px';
    this.selectionElement.style.width = rect.width + 'px';
    this.selectionElement.style.height = rect.height + 'px';
  }

  /**
   * Remove the selection element from the DOM
   */
  removeSelectionElement() {
    if (this.selectionElement && this.selectionElement.parentNode) {
      document.body.removeChild(this.selectionElement);
      this.selectionElement = null;
    }
  }

  /**
   * Calculate the selection rectangle based on start and current positions
   * @returns {Object} The selection rectangle with left, top, width, and height
   */
  getSelectionRect() {
    const left = Math.min(this.startX, this.currentX);
    const top = Math.min(this.startY, this.currentY);
    const width = Math.abs(this.currentX - this.startX);
    const height = Math.abs(this.currentY - this.startY);

    return { left, top, width, height };
  }

  /**
   * Get the most numerous type of elements within the region
   * @param {Object} rect The selection rectangle with left, top, width, and height
   * @returns {Object} Object with type and elements array of the most numerous type
   */
  getMostNumerousTypeInRegion(rect) {
    let highlightElements = [];
    if (globalThis.FishBowlShadowDomTools && typeof globalThis.FishBowlShadowDomTools.querySelectorAllDeep === 'function') {
      highlightElements = globalThis.FishBowlShadowDomTools.querySelectorAllDeep('.fishbowl-highlight[data-selectable="true"]', document);
    } else {
      highlightElements = document.querySelectorAll('.fishbowl-highlight[data-selectable="true"]');
    }

    // Group overlapping elements by type
    const typeCounter = {};

    // Count elements of each type within the selection
    highlightElements.forEach(element => {
      // Get element bounds
      const bounds = element.getBoundingClientRect();

      // Check if element is within the selection rectangle
      const isOverlapping = (
        bounds.left < rect.left + rect.width &&
        bounds.left + bounds.width > rect.left &&
        bounds.top < rect.top + rect.height &&
        bounds.top + bounds.height > rect.top
      );

      if (isOverlapping) {
        // Determine element type by its data-type attribute
        const type = element.dataset.type;
        if (type) {
          if (!typeCounter[type]) {
            typeCounter[type] = { count: 0, elements: [] };
          }
          typeCounter[type].count++;
          typeCounter[type].elements.push(element);
        }
      }
    });

    // Find the most numerous type
    let mostNumerous = { type: 'none', elements: [] };
    let highestCount = 0;

    Object.keys(typeCounter).forEach(type => {
      if (typeCounter[type].count > highestCount) {
        highestCount = typeCounter[type].count;
        mostNumerous = { type, elements: typeCounter[type].elements };
      }
    });

    return mostNumerous;
  }

  /**
   * Select all selectable items within the given region
   * @param {Object} rect The selection rectangle with left, top, width, and height
   */
  selectItemsInRegion(rect) {
    // Get the most numerous type in the region
    const mostNumerous = this.getMostNumerousTypeInRegion(rect);
    const elementsToSelect = mostNumerous.elements;
    const elementsInRegion = [];

    // Track selected items for UI update
    const selectedPanelItems = [];

    if (window.FishBowlUiManager && typeof window.FishBowlUiManager.clearSelection === 'function') {
      window.FishBowlUiManager.clearSelection();
    }
    document.querySelectorAll('.fishbowl-region-selected').forEach(element => {
      elementsInRegion.push(element);
    });

    // If no items found, exit
    if (elementsToSelect.length === 0) {
      return;
    }

    // Second pass: toggle selection state for the elements we want to select
    elementsToSelect.forEach(element => {
      // Get the element type and content
      const type = element.getAttribute('data-type');
      const content = element.getAttribute('data-content');

      if (type && content && window.FishBowlUiManager) {
        const typeInfo = FishBowlConsts.ENTITY_TYPES[type];
        if (typeInfo) {
          const root = window.fishTankHUD?.hudShadowRoot || document;
          const panelItem = root.querySelector(`.${typeInfo.itemClass}[${typeInfo.dataAttr}="${content}"]`);
          if (panelItem && !panelItem.classList.contains('selected')) {
            window.FishBowlUiManager.selectionManager.selectedItems.push(panelItem);
            panelItem.classList.add('selected');
            selectedPanelItems.push(panelItem);
          }
        }
      }
    });

    // After all items are selected, update UI state
    if (selectedPanelItems.length > 0 && window.FishBowlUiManager) {
      // Determine which panel was selected from
      const panelId = window.FishBowlUiManager.getPanelIdFromElement(selectedPanelItems[0]);
      if (panelId) {
        window.FishBowlUiManager.selectionManager.activePanel = panelId;
        window.FishBowlUiManager.updatePanelHeader(panelId);
      }

      // Update selected items for page highlighting
      window.FishBowlUiManager.updateSelectedItems();

      // Update the copy hint
      window.FishBowlUiManager.updateSelectionPanel();
    }

    // Remove temporary highlights after a delay
    setTimeout(() => {
      elementsInRegion.forEach(element => {
        element.classList.remove('fishbowl-region-selected');
      });
    }, 500); // Remove after 500ms

    // Show feedback
    if (elementsToSelect.length > 0 && window.FishBowlUiManager) {
      window.FishBowlUiManager.addFeedEntry(
        `Selected ${elementsToSelect.length} ${mostNumerous.type} items via region selection`,
        'info'
      );
    }
  }
}
