document.addEventListener('DOMContentLoaded', () => {
    const initialState = {
        domain: [-100, 100],
        brushExtent: [-10, 10],
        detailZoom: {
            decimals: d3.zoomIdentity,
            fractions: d3.zoomIdentity
        }
    };

    let state = deepCopy(initialState);

    const margin = { top: 20, right: 30, bottom: 40, left: 30 };
    const height = 100; // Fixed height for SVGs

    // --- Helper Functions ---
    function deepCopy(obj) {
        return JSON.parse(JSON.stringify(obj)); // Simple deep copy for this state structure
    }

    function gcd(a, b) {
        a = Math.abs(a);
        b = Math.abs(b);
        if (b === 0) return a;
        return gcd(b, a % b);
    }

    function formatFraction(num) {
        if (Number.isInteger(num)) {
            return num.toString();
        }
        const sign = num < 0 ? "-" : "";
        num = Math.abs(num);
        const integerPart = Math.floor(num);
        const fractionalPart = num - integerPart;

        if (fractionalPart < 1e-9) { // Effectively zero
            return sign + integerPart.toString();
        }

        // Try denominators up to a certain limit for "child-friendly" fractions
        const maxDenominator = 16; // Can be adjusted
        let bestN = 1, bestD = 2; // Default to 1/2 if no exact match
        let minError = Infinity;

        for (let d = 2; d <= maxDenominator; d++) {
            const n = Math.round(fractionalPart * d);
            if (n === 0) continue; // Avoid 0/d
            const error = Math.abs(fractionalPart - n / d);
            if (error < minError) {
                minError = error;
                bestN = n;
                bestD = d;
            }
            if (error < 1e-9) break; // Found a very good match
        }

        const common = gcd(bestN, bestD);
        const numerator = bestN / common;
        const denominator = bestD / common;

        if (numerator === denominator) { // e.g. 2/2 becomes 1
            return sign + (integerPart + 1).toString();
        }
        if (numerator === 0) {
            return sign + integerPart.toString();
        }


        let fractionStr = `${numerator}/${denominator}`;
        if (integerPart > 0) {
            return `${sign}${integerPart} ${fractionStr}`;
        }
        return sign + fractionStr;
    }

    // --- DOM Selections ---
    const topSvg = d3.select("#topNumberline").append("svg");
    const decimalSvg = d3.select("#decimalNumberline").append("svg");
    const fractionSvg = d3.select("#fractionNumberline").append("svg");
    const resetButton = d3.select("#resetButton");

    // --- Scales (will be updated) ---
    let topXScale, decimalXScale, fractionXScale;
    let topAxis, decimalAxis, fractionAxis;
    let topAxisGroup, decimalAxisGroup, fractionAxisGroup;
    let topBrush, topBrushGroup;
    let topZoom, decimalZoom, fractionZoom;

    function initializeNumberlines() {
        const numberlineContainers = d3.selectAll(".numberline-container svg");
        const availableWidth = numberlineContainers.node().getBoundingClientRect().width;
        const width = availableWidth - margin.left - margin.right;

        // --- Top Numberline ---
        topXScale = d3.scaleLinear().range([0, width]);
        topAxis = d3.axisBottom(topXScale);
        topSvg.selectAll("*").remove(); // Clear previous elements
        const topG = topSvg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        topAxisGroup = topG.append("g").attr("class", "axis axis--x").attr("transform", `translate(0,${height - margin.top - margin.bottom - 10})`);

        topBrush = d3.brushX()
            .extent([[0, 0], [width, height - margin.top - margin.bottom - 10]]) // Area for brush
            .on("brush end", brushed);

        topBrushGroup = topG.append("g").attr("class", "brush").call(topBrush);

        topZoom = d3.zoom()
            .scaleExtent([0.1, 100]) // Example scale extent, adjust as needed
            .translateExtent([[-Infinity, 0], [Infinity, 0]]) // Pan anywhere horizontally
            .on("zoom", topZoomed);
        topSvg.call(topZoom);


        // --- Decimal Numberline ---
        decimalXScale = d3.scaleLinear().range([0, width]);
        decimalAxis = d3.axisBottom(decimalXScale);
        decimalSvg.selectAll("*").remove();
        const decimalG = decimalSvg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        decimalAxisGroup = decimalG.append("g").attr("class", "axis axis--x").attr("transform", `translate(0,${height - margin.top - margin.bottom - 10})`);

        decimalZoom = d3.zoom()
            .on("zoom", (event) => detailZoomed(event, 'decimals', decimalSvg, decimalXScale, decimalAxis, decimalAxisGroup));
        decimalSvg.call(decimalZoom);


        // --- Fraction Numberline ---
        fractionXScale = d3.scaleLinear().range([0, width]);
        fractionAxis = d3.axisBottom(fractionXScale).tickFormat(formatFraction);
        fractionSvg.selectAll("*").remove();
        const fractionG = fractionSvg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        fractionAxisGroup = fractionG.append("g").attr("class", "axis axis--x").attr("transform", `translate(0,${height - margin.top - margin.bottom - 10})`);

        fractionZoom = d3.zoom()
            .on("zoom", (event) => detailZoomed(event, 'fractions', fractionSvg, fractionXScale, fractionAxis, fractionAxisGroup));
        fractionSvg.call(fractionZoom);
    }


    // --- Update Functions ---
    function updateViews() {
        const availableWidth = topSvg.node().getBoundingClientRect().width;
        const width = availableWidth - margin.left - margin.right;

        // Update Top Numberline
        topXScale.domain(state.domain).range([0, width]);
        topAxisGroup.call(topAxis.scale(topXScale));
        topZoom.extent([[margin.left, margin.top], [availableWidth - margin.right, height - margin.bottom]]);

        // Programmatically move brush if state.brushExtent changed
        // Ensure brush extent is valid before moving
        if (state.brushExtent && state.brushExtent[0] < state.brushExtent[1]) {
            const brushPixelStart = topXScale(state.brushExtent[0]);
            const brushPixelEnd = topXScale(state.brushExtent[1]);
            if (isFinite(brushPixelStart) && isFinite(brushPixelEnd)) {
                // Check if current brush selection matches state, to avoid infinite loops
                const currentSelection = d3.brushSelection(topBrushGroup.node());
                if (!currentSelection ||
                    Math.abs(currentSelection[0] - brushPixelStart) > 1 ||
                    Math.abs(currentSelection[1] - brushPixelEnd) > 1) {
                    topBrushGroup.call(topBrush.move, [brushPixelStart, brushPixelEnd]);
                }
            } else {
                topBrushGroup.call(topBrush.move, null); // Clear brush if extent is not valid
            }
        } else {
            topBrushGroup.call(topBrush.move, null); // Clear brush if extent is invalid
        }


        // Update Decimal Numberline
        const decimalEffectiveDomain = state.detailZoom.decimals.rescaleX(decimalXScale.domain(state.brushExtent)).domain();
        decimalXScale.domain(decimalEffectiveDomain).range([0, width]);
        decimalAxisGroup.call(decimalAxis.scale(decimalXScale));
        // Constrain detail zoom
        decimalZoom.translateExtent([[decimalXScale.range()[0], -Infinity], [decimalXScale.range()[1], Infinity]])
            .scaleExtent([1, Infinity]); // Must at least show full brushExtent


        // Update Fraction Numberline
        const fractionEffectiveDomain = state.detailZoom.fractions.rescaleX(fractionXScale.domain(state.brushExtent)).domain();
        fractionXScale.domain(fractionEffectiveDomain).range([0, width]);

        // Custom tick generation for fractions
        const [fStart, fEnd] = fractionEffectiveDomain;
        const fractionTicks = [];
        const denominators = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]; // Denominators to try
        const targetTickCount = Math.max(2, Math.min(10, Math.floor(width / 70))); // Aim for 5-10 ticks

        let addedTicks = new Set(); // To avoid duplicate numerical values with different fraction representations

        for (let d of denominators) {
            for (let i = Math.floor(fStart * d) - 1; i <= Math.ceil(fEnd * d) + 1; i++) {
                const val = i / d;
                if (val >= fStart && val <= fEnd) {
                    const simplifiedVal = parseFloat(formatFraction(val).replace(/[^\d.-/]/g, (match, offset, string) => {
                        if (match === ' ') return ''; // Handle mixed numbers space
                        if (match === '/' && string.indexOf('/') !== offset) return ''; // Only first slash
                        return match;
                    }).split(' ').map(s => { // Handle mixed numbers like "1 1/2"
                        if (s.includes('/')) {
                            const parts = s.split('/');
                            return parseFloat(parts[0]) / parseFloat(parts[1]);
                        }
                        return parseFloat(s);
                    }).reduce((a, b) => a + (a > 0 ? b : -b), 0)); // Sum parts for mixed numbers, careful with sign

                    const roundedVal = Math.round(val * 1e6) / 1e6; // Round to avoid floating point issues in Set
                    if (!addedTicks.has(roundedVal)) {
                        fractionTicks.push(val);
                        addedTicks.add(roundedVal);
                    }
                }
            }
        }
        // Sort and unique (though Set should handle uniqueness for roundedVal)
        fractionTicks.sort((a, b) => a - b);
        let uniqueFractionTicks = [...new Set(fractionTicks.map(t => Math.round(t * 1e6) / 1e6))].map(t => fractionTicks.find(ft => Math.round(ft * 1e6) / 1e6 === t));


        // If too many ticks, try to thin them out, prioritizing smaller denominators or whole numbers
        if (uniqueFractionTicks.length > targetTickCount * 1.5) {
            uniqueFractionTicks = uniqueFractionTicks.filter((t, i) => {
                if (Number.isInteger(t)) return true; // Keep integers
                if (uniqueFractionTicks.length > targetTickCount && i % 2 !== 0 && Math.abs(t - Math.round(t)) > 0.1) return false; // Remove some non-integers
                return true;
            });
            if (uniqueFractionTicks.length > targetTickCount * 1.5) { // Second pass if still too many
                uniqueFractionTicks = d3.scaleLinear().domain(d3.extent(uniqueFractionTicks)).ticks(targetTickCount);
            }
        }


        fractionAxis.tickValues(uniqueFractionTicks.length > 1 ? uniqueFractionTicks : fractionXScale.ticks(targetTickCount));
        fractionAxisGroup.call(fractionAxis.scale(fractionXScale));

        // Constrain detail zoom
        fractionZoom.translateExtent([[fractionXScale.range()[0], -Infinity], [fractionXScale.range()[1], Infinity]])
            .scaleExtent([1, Infinity]);
    }

    // --- Event Handlers ---
    function topZoomed(event) {
        const newDomain = event.transform.rescaleX(topXScale.copy().domain(initialState.domain)).domain();

        // Clamp domain to prevent extreme zoom out beyond reasonable limits if needed
        // For now, allow wide zoom out, but could add clamping here, e.g.
        // newDomain[0] = Math.max(newDomain[0], -10000);
        // newDomain[1] = Math.min(newDomain[1], 10000);

        state.domain = newDomain;

        // Clamp brushExtent
        const oldBrushMin = state.brushExtent[0];
        const oldBrushMax = state.brushExtent[1];
        let newBrushMin = Math.max(state.domain[0], oldBrushMin);
        let newBrushMax = Math.min(state.domain[1], oldBrushMax);

        if (newBrushMin >= newBrushMax) { // Brush is outside or collapsed
            const domainWidth = state.domain[1] - state.domain[0];
            const initialBrushWidth = initialState.brushExtent[1] - initialState.brushExtent[0];
            let defaultBrushWidth = Math.min(initialBrushWidth, domainWidth * 0.8); // Try to keep initial width or 80% of domain
            if (domainWidth < defaultBrushWidth) defaultBrushWidth = domainWidth;


            const domainCenter = (state.domain[0] + state.domain[1]) / 2;
            newBrushMin = domainCenter - defaultBrushWidth / 2;
            newBrushMax = domainCenter + defaultBrushWidth / 2;

            // Ensure it's still within the new domain
            newBrushMin = Math.max(state.domain[0], newBrushMin);
            newBrushMax = Math.min(state.domain[1], newBrushMax);
            if (newBrushMin >= newBrushMax) { // Failsafe if domain is tiny
                newBrushMin = state.domain[0];
                newBrushMax = state.domain[1];
            }
        }
        state.brushExtent = [newBrushMin, newBrushMax];

        state.detailZoom.decimals = d3.zoomIdentity;
        state.detailZoom.fractions = d3.zoomIdentity;

        // Reset detail view transforms programmatically
        decimalSvg.call(decimalZoom.transform, d3.zoomIdentity);
        fractionSvg.call(fractionZoom.transform, d3.zoomIdentity);

        updateViews();
    }

    function brushed(event) {
        if (!event.sourceEvent) return; // Ignore brush-by-zoom
        if (!event.selection) { // If brush is cleared
            // Optionally reset to a default or do nothing specific here.
            // For now, let's assume we want to keep the last valid brushExtent
            // or allow it to be "empty" which updateViews handles by clearing brush.
            // state.brushExtent = null; // or some default
            updateViews(); // Update detail views to reflect empty/old state
            return;
        }

        const newBrushExtent = event.selection.map(topXScale.invert);

        // Clamp to current domain
        state.brushExtent = [
            Math.max(state.domain[0], newBrushExtent[0]),
            Math.min(state.domain[1], newBrushExtent[1])
        ];

        state.detailZoom.decimals = d3.zoomIdentity;
        state.detailZoom.fractions = d3.zoomIdentity;

        // Reset detail view transforms programmatically
        decimalSvg.call(decimalZoom.transform, d3.zoomIdentity);
        fractionSvg.call(fractionZoom.transform, d3.zoomIdentity);

        updateViews(); // Only need to update detail views, but full update is safer
    }

    function detailZoomed(event, type, svgElement, scale, axis, axisGroup) {
        // The scale's domain is state.brushExtent
        // The event.transform is applied to this scale.
        const baseScale = d3.scaleLinear().domain(state.brushExtent).range(scale.range());
        let newTransform = event.transform;

        // Constrain panning: effective domain must stay within brushExtent
        const currentEffectiveDomain = newTransform.rescaleX(baseScale).domain();

        if (currentEffectiveDomain[0] < state.brushExtent[0]) {
            newTransform = newTransform.translate((baseScale(state.brushExtent[0]) - baseScale(currentEffectiveDomain[0])), 0);
        }
        if (currentEffectiveDomain[1] > state.brushExtent[1]) {
            newTransform = newTransform.translate((baseScale(state.brushExtent[1]) - baseScale(currentEffectiveDomain[1])), 0);
        }

        // Constrain scaling: cannot zoom out beyond showing the full brushExtent
        if (newTransform.k < 1) {
            newTransform = d3.zoomIdentity.translate(newTransform.x, newTransform.y).scale(1);
        }
        // Apply a max zoom if desired, e.g., newTransform.k = Math.min(newTransform.k, 20);

        state.detailZoom[type] = newTransform;

        // Programmatically set the transform on the SVG element to reflect constraints
        // This also avoids infinite loops if the event wasn't from user.
        if (svgElement.property("__zoom").k !== newTransform.k ||
            svgElement.property("__zoom").x !== newTransform.x) {
            svgElement.call(type === 'decimals' ? decimalZoom.transform : fractionZoom.transform, newTransform);
        }

        // Update only this view
        const effectiveDomain = newTransform.rescaleX(d3.scaleLinear().domain(state.brushExtent)).domain();
        scale.domain(effectiveDomain); // Update the scale passed to the axis

        if (type === 'fractions') {
            // Recalculate ticks for fractions based on new effectiveDomain
            const [fStart, fEnd] = effectiveDomain;
            const fractionTicks = [];
            const denominators = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16];
            const targetTickCount = Math.max(2, Math.min(10, Math.floor(scale.range()[1] / 70)));
            let addedTicks = new Set();

            for (let d of denominators) {
                for (let i = Math.floor(fStart * d) - 1; i <= Math.ceil(fEnd * d) + 1; i++) {
                    const val = i / d;
                    if (val >= fStart && val <= fEnd) {
                        const roundedVal = Math.round(val * 1e6) / 1e6;
                        if (!addedTicks.has(roundedVal)) {
                            fractionTicks.push(val);
                            addedTicks.add(roundedVal);
                        }
                    }
                }
            }
            fractionTicks.sort((a, b) => a - b);
            let uniqueFractionTicks = [...new Set(fractionTicks.map(t => Math.round(t * 1e6) / 1e6))].map(t => fractionTicks.find(ft => Math.round(ft * 1e6) / 1e6 === t));

            if (uniqueFractionTicks.length > targetTickCount * 1.5) {
                uniqueFractionTicks = uniqueFractionTicks.filter((t, i) => {
                    if (Number.isInteger(t)) return true;
                    if (uniqueFractionTicks.length > targetTickCount && i % 2 !== 0 && Math.abs(t - Math.round(t)) > 0.1) return false;
                    return true;
                });
                if (uniqueFractionTicks.length > targetTickCount * 1.5) {
                    uniqueFractionTicks = d3.scaleLinear().domain(d3.extent(uniqueFractionTicks)).ticks(targetTickCount);
                }
            }
            axis.tickValues(uniqueFractionTicks.length > 1 ? uniqueFractionTicks : scale.ticks(targetTickCount));
        }

        axisGroup.call(axis.scale(scale));
    }


    function handleReset() {
        state = deepCopy(initialState);

        // Reset top numberline zoom & brush
        topSvg.call(topZoom.transform, d3.zoomIdentity); // This will trigger topZoomed, which handles state updates and view refresh

        // topZoomed will reset detail zooms and call updateViews, which moves the brush
        // Explicitly ensure brush is moved AFTER zoom identity is set on topSvg.
        // The topZoomed function should handle setting the brushExtent and updating views correctly.
        // However, to be absolutely sure the brush visuals are correct:
        // Need a slight delay or ensure updateViews after topZoom.transform is fully processed.
        // The call to topZoom.transform will trigger its "zoom" event handler (topZoomed)
        // topZoomed will:
        // 1. Set state.domain from initialState (due to d3.zoomIdentity on initial scale)
        // 2. Set state.brushExtent based on initialState.brushExtent (clamped to new domain if necessary)
        // 3. Reset state.detailZoom
        // 4. Call updateViews()
        // updateViews() will then use these reset states to render everything, including brush position.
    }

    resetButton.on("click", handleReset);

    // Initial setup
    initializeNumberlines();

    // Initial render. Reset top zoom to establish initial state transform for top numberline
    // This ensures the initial view matches initialState.domain without any zoom transform.
    const initialTopTransform = d3.zoomIdentity
        .translate(-topXScale(initialState.domain[0]), 0) // This part might be tricky if scale isn't set up right.
        .scale((topXScale.range()[1] - topXScale.range()[0]) / (initialState.domain[1] - initialState.domain[0]));

    // To correctly apply the initial state, we actually want the topZoom behavior to reflect the initial domain.
    // This is usually achieved by setting the initial transform such that event.transform.rescaleX(initialScale).domain() IS state.domain.
    // Let initialX be a scale with domain [0, width] (pixel space).
    // Then topXScale domain is state.domain.
    // topZoom.transform(topSvg, d3.zoomIdentity) followed by updateViews should work
    // if topXScale is correctly initialized with state.domain.

    topSvg.call(topZoom.transform, d3.zoomIdentity); // This sets the initial transform for top view.
    updateViews(); // Draw everything based on initial state.

    // Responsive resize
    window.addEventListener('resize', () => {
        initializeNumberlines(); // Re-initialize scales, axes, brushes with new width
        // Restore zoom/brush states programmatically
        topSvg.call(topZoom.transform, topZoom.scaleTo(topSvg, state.detailZoom.top ? state.detailZoom.top.k : 1)); // Approximation or need to store top transform

        // More robust resize:
        // 1. Re-initialize (calculates new width, re-creates scales with old domains)
        // 2. Re-apply current zoom transforms to all SVGs
        // 3. Call updateViews()

        // For a simpler resize, just re-initialize and update based on current state:
        // (This might lose current zoom levels if not handled carefully, but state holds numerical domains)

        // Re-initialize with new width
        const availableWidth = topSvg.node().getBoundingClientRect().width;
        const width = availableWidth - margin.left - margin.right;

        topXScale.range([0, width]);
        decimalXScale.range([0, width]);
        fractionXScale.range([0, width]);

        // Re-apply brush extent and zoom transforms
        topBrush.extent([[0, 0], [width, height - margin.top - margin.bottom - 10]]);
        topBrushGroup.call(topBrush); // Re-attach brush

        // Re-apply zoom transforms (important for detail views)
        topSvg.call(topZoom.transform, d3.zoomTransform(topSvg.node())); // Keep current zoom
        decimalSvg.call(decimalZoom.transform, state.detailZoom.decimals);
        fractionSvg.call(fractionZoom.transform, state.detailZoom.fractions);

        updateViews();
    });
});