document.addEventListener('DOMContentLoaded', () => {
    // --- 3. Single Source of Truth ---
    const initialState = {
        domain: [-100, 100],
        brush: [-10, 10]
    };
    let state = { ...initialState };

    let isBrushing = false; // Flag to indicate an active user brush operation

    // --- SVG Setup & Dimensions ---
    const margin = { top: 10, right: 20, bottom: 30, left: 20 };

    function getDimensions(selector) {
        const container = document.querySelector(selector);
        const svgEl = container.querySelector('svg'); // Renamed to avoid conflict
        const width = svgEl.clientWidth - margin.left - margin.right;
        const height = svgEl.clientHeight - margin.top - margin.bottom;
        return { svgEl, width, height, clientWidth: svgEl.clientWidth, clientHeight: svgEl.clientHeight };
    }

    // --- Top Band (Summary Line) ---
    const topBand = getDimensions('#summary-container');
    const svgTop = d3.select(topBand.svgEl) // Use svgEl from getDimensions
        .attr("width", topBand.clientWidth)
        .attr("height", topBand.clientHeight);
    const gTop = svgTop.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xTop = d3.scaleLinear().range([0, topBand.width]);
    const xAxisTop = d3.axisBottom(xTop);
    const gXAxisTop = gTop.append("g")
        .attr("class", "axis axis--x")
        .attr("transform", `translate(0,${topBand.height})`);

    // --- Middle Band (Decimal Detail) ---
    const decimalBand = getDimensions('#decimal-container');
    const svgDecimal = d3.select(decimalBand.svgEl)
        .attr("width", decimalBand.clientWidth)
        .attr("height", decimalBand.clientHeight);
    const gDecimal = svgDecimal.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xDecimal = d3.scaleLinear().range([0, decimalBand.width]);
    const xAxisDecimal = d3.axisBottom(xDecimal);
    const gXAxisDecimal = gDecimal.append("g")
        .attr("class", "axis axis--x")
        .attr("transform", `translate(0,${decimalBand.height})`);

    // --- Bottom Band (Fraction Detail) ---
    const fractionBand = getDimensions('#fraction-container');
    const svgFraction = d3.select(fractionBand.svgEl)
        .attr("width", fractionBand.clientWidth)
        .attr("height", fractionBand.clientHeight);
    const gFraction = svgFraction.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xFraction = d3.scaleLinear().range([0, fractionBand.width]);
    const xAxisFraction = d3.axisBottom(xFraction).tickFormat(formatFractionTick).ticks(7);
    const gXAxisFraction = gFraction.append("g")
        .attr("class", "axis axis--x")
        .attr("transform", `translate(0,${fractionBand.height})`);

    // --- Helper: Fraction Formatter (same as before) ---
    function gcd(a, b) { /* ... */ }
    function formatFractionTick(value) { /* ... */ }
    // (Copy the full fraction formatter functions from the previous correct version)
    function gcd(a, b) {
        return b ? gcd(b, a % b) : a;
    }

    function formatFractionTick(value) {
        const epsilon = 1e-9;
        // Check for whole numbers (including 0) carefully
        if (Math.abs(value - Math.round(value)) < epsilon) {
            return Math.round(value).toString();
        }

        const sign = value < 0 ? "-" : "";
        let absValue = Math.abs(value);

        let integerPart = Math.floor(absValue + epsilon);
        let fractionalPart = absValue - integerPart;

        if (fractionalPart < epsilon) return sign + integerPart; // Should be caught by round check
        if (1 - fractionalPart < epsilon && integerPart + 1 !== 0) return sign + (integerPart + 1);
        if (1 - fractionalPart < epsilon && integerPart + 1 === 0 && sign === "-") return "0"; // Handle -0 case correctly becoming "0" for things like -0.999... -> 0

        let bestN = 0, bestD = 1;
        let minError = Math.abs(fractionalPart);

        for (let d_loop = 1; d_loop <= 12; d_loop++) {
            for (let n_loop = 1; n_loop < d_loop; n_loop++) {
                let currentError = Math.abs(fractionalPart - n_loop / d_loop);
                if (currentError < minError - epsilon) {
                    minError = currentError;
                    bestN = n_loop;
                    bestD = d_loop;
                } else if (Math.abs(currentError - minError) < epsilon) {
                    if (d_loop < bestD) {
                        bestN = n_loop;
                        bestD = d_loop;
                    }
                }
            }
        }

        if (bestN === 0) { // Fractional part is best represented as 0 (or was integer initially)
            if (integerPart === 0 && sign === "-") return "0"; // Avoid "-0"
            return sign + integerPart;
        }


        const common = gcd(bestN, bestD);
        const simpleN = bestN / common;
        const simpleD = bestD / common;

        let result = "";
        if (integerPart > 0) result += integerPart + " ";
        else if (integerPart === 0 && sign === "-") { /* no space for "- n/d" */ }
        else if (integerPart !== 0) result += integerPart + " ";


        result += simpleN + "/" + simpleD;
        if (integerPart === 0 && sign === "" && result === "0/1") return "0"; // Should not happen with bestN > 0
        return sign + result;
    }


    // --- Brush Element ---
    // gBrush must be defined before it's used in zoom.filter
    const gBrush = gTop.append("g").attr("class", "brush");

    // --- Zoom Behavior ---
    const zoom = d3.zoom()
        .scaleExtent([
            (initialState.domain[1] - initialState.domain[0]) / 2000,
            (initialState.domain[1] - initialState.domain[0]) / 0.1
        ])
        .extent([[0, 0], [topBand.width, topBand.height]]) // Relative to gTop if zoom on gTop
        .translateExtent([[-Infinity, -Infinity], [Infinity, Infinity]])
        .filter(event => {
            // Standard D3 zoom filter: allow left-button drag, wheel, touch.
            // No right-click drag, no ctrl-key drag (often for brush).
            const standardFilter = !event.ctrlKey && !event.button; // !event.button for left mouse button (0)
            if (!standardFilter) return false;

            // If mousedown/touchstart, check if it's on the brush.
            // If so, brush handles it, zoom doesn't start a gesture.
            if (event.type === "mousedown" || event.type === "touchstart") {
                // gBrush.node() is the <g class="brush"> element.
                // The brush creates an overlay rect inside gBrush for initiating new brushes
                // and handles on the selection.
                if (gBrush.node() && gBrush.node().contains(event.target)) {
                    return false; // Don't start zoom if event target is within the brush group
                }
            }
            // Allow zoom for wheel events, or mousedown/touchstart on background (not on brush)
            return true;
        })
        .on("zoom", zoomed);

    svgTop.call(zoom); // Apply zoom to svgTop

    // --- Brush Behavior ---
    const brush = d3.brushX()
        .extent([[0, 0], [topBand.width, topBand.height]]) // Relative to gBrush's coordinate system
        .on("start", brushStarted)
        .on("brush", brushedInProgress)
        .on("end", brushEnded);

    gBrush.call(brush); // Apply brush to gBrush AFTER gBrush is defined

    // --- Behavior Rules Implementation ---
    function calculateResetBrushForDomain(domain) {
        const domainSpan = domain[1] - domain[0];
        const center = (domain[0] + domain[1]) / 2;
        let newBrushSpan;

        if (domainSpan <= 1e-6) {
            newBrushSpan = 1; // Default span if domain is zero or negative
        } else if (domainSpan >= 20) {
            newBrushSpan = 20;
        } else {
            newBrushSpan = domainSpan * 0.1;
        }
        newBrushSpan = Math.max(newBrushSpan, 1e-6);

        let newBrush = [center - newBrushSpan / 2, center + newBrushSpan / 2];
        newBrush[0] = Math.max(domain[0], newBrush[0]);
        newBrush[1] = Math.min(domain[1], newBrush[1]);

        if (newBrush[0] >= newBrush[1] && domain[0] < domain[1]) {
            newBrush[0] = domain[0];
            newBrush[1] = Math.min(domain[1], domain[0] + newBrushSpan);
            if (newBrush[0] >= newBrush[1]) {
                newBrush[1] = domain[1];
            }
        }
        return newBrush;
    }

    function zoomed(event) {
        // The zoom.filter should prevent pan-during-brush.
        // This isBrushing check is a fallback or for programmatic scenarios.
        if (isBrushing && event.sourceEvent && (event.sourceEvent.type === 'mousemove' || event.sourceEvent.type === 'touchmove')) {
            // If actively brushing AND this zoom event is from a user drag (mousemove/touchmove),
            // this implies a pan attempt during brush. The filter should have caught this.
            // If it didn't, returning here prevents domain change.
            return;
        }

        const transform = event.transform;
        const referenceScale = d3.scaleLinear().domain(initialState.domain).range(xTop.range());
        state.domain = transform.rescaleX(referenceScale).domain();

        let [b0, b1] = state.brush;
        b0 = Math.max(b0, state.domain[0]);
        b1 = Math.min(b1, state.domain[1]);

        if (b0 >= b1) {
            state.brush = calculateResetBrushForDomain(state.domain);
        } else {
            state.brush = [b0, b1];
        }

        renderAll();
    }

    function brushStarted(event) {
        if (event.sourceEvent) {
            isBrushing = true;
        }
    }

    function brushedInProgress(event) {
        if (!event.sourceEvent) return;

        if (event.selection) {
            let newBrush = event.selection.map(xTop.invert);
            newBrush[0] = Math.max(state.domain[0], newBrush[0]);
            newBrush[1] = Math.min(state.domain[1], newBrush[1]);
            if (newBrush[0] > newBrush[1]) newBrush[0] = newBrush[1];

            if (state.brush[0] !== newBrush[0] || state.brush[1] !== newBrush[1]) {
                state.brush = newBrush;
                renderDecimalBand();
                renderFractionBand();
            }
        }
    }

    function brushEnded(event) {
        const userEnd = !!event.sourceEvent;
        isBrushing = false; // Set immediately for both user and programmatic ends.

        if (userEnd) {
            if (event.selection) {
                let finalBrush = event.selection.map(xTop.invert);
                finalBrush[0] = Math.max(state.domain[0], finalBrush[0]);
                finalBrush[1] = Math.min(state.domain[1], finalBrush[1]);
                if (finalBrush[0] > finalBrush[1]) finalBrush[0] = finalBrush[1];
                state.brush = finalBrush;
            } else {
                state.brush = calculateResetBrushForDomain(state.domain);
            }
            renderAll(); // Full re-render to ensure consistency.
        }
        // For programmatic brush end (sourceEvent is null), usually called from renderAll/renderTopBand.
        // isBrushing is already false. No further renderAll() needed here to avoid loops.
    }

    // --- Rendering Functions ---
    function renderTopBand() {
        xTop.domain(state.domain);
        gXAxisTop.call(xAxisTop);

        // Check if brush values are valid and within the domain before mapping to pixels
        if (state.brush && state.brush.length === 2 &&
            state.brush[0] <= state.brush[1] &&
            state.brush[1] >= state.domain[0] && // Brush end is after domain start
            state.brush[0] <= state.domain[1]) { // Brush start is before domain end

            // Clamp brush to be strictly within domain for pixel mapping to avoid NaN/Infinity from xTop
            const effectiveBrush = [
                Math.max(state.domain[0], state.brush[0]),
                Math.min(state.domain[1], state.brush[1])
            ];

            if (effectiveBrush[0] <= effectiveBrush[1]) { // Ensure still valid after clamping
                const pixelBrush = [xTop(effectiveBrush[0]), xTop(effectiveBrush[1])];
                if (isFinite(pixelBrush[0]) && isFinite(pixelBrush[1])) {
                    gBrush.call(brush.move, pixelBrush);
                } else {
                    gBrush.call(brush.move, null);
                }
            } else {
                gBrush.call(brush.move, null); // Clamped brush is invalid
            }
        } else {
            gBrush.call(brush.move, null); // Brush state is invalid or completely outside domain
        }
    }

    function renderDecimalBand() { /* ... */ } // (Same as before)
    function renderFractionBand() { /* ... */ } // (Same as before)
    // (Copy the full renderDecimalBand and renderFractionBand functions from the previous correct version)
    function renderDecimalBand() {
        if (!state.brush || state.brush[0] > state.brush[1]) {
            gXAxisDecimal.selectAll("*").remove(); // Clear axis if brush is invalid
            return;
        }
        xDecimal.domain(state.brush);
        gXAxisDecimal.call(xAxisDecimal);
    }

    function renderFractionBand() {
        if (!state.brush || state.brush[0] > state.brush[1]) {
            gXAxisFraction.selectAll("*").remove(); // Clear axis if brush is invalid
            return;
        }
        xFraction.domain(state.brush);
        const brushSpan = state.brush[1] - state.brush[0];
        let numTicks = 7;
        if (brushSpan === 0) numTicks = 1;
        else if (brushSpan < 0.001 && brushSpan > 0) numTicks = 2; // Very small span
        else if (brushSpan < 0.01) numTicks = 3;
        else if (brushSpan < 0.1) numTicks = 3;
        else if (brushSpan < 1) numTicks = Math.max(3, Math.min(5, Math.floor(brushSpan / 0.15)));
        else if (brushSpan > 50) numTicks = 10;
        else if (brushSpan > 10) numTicks = Math.min(10, Math.floor(brushSpan / 2));


        // Ensure at least 2 ticks if possible, to show range
        if (numTicks < 2 && brushSpan > 1e-6) numTicks = 2;
        // Max ticks can also be set, e.g. 10-12
        numTicks = Math.min(numTicks, 10);


        xAxisFraction.ticks(numTicks);
        gXAxisFraction.call(xAxisFraction);
    }


    function renderAll() {
        renderTopBand();
        renderDecimalBand();
        renderFractionBand();
    }

    // --- Reset Button ---
    document.getElementById('resetButton').addEventListener('click', () => {
        state = JSON.parse(JSON.stringify(initialState));
        // Reset zoom transform. This will trigger 'zoomed' event which calls renderAll.
        svgTop.call(zoom.transform, d3.zoomIdentity);
    });

    // --- Initial Render ---
    // Initialize brush component AFTER xTop domain might be set by initial zoom call.
    // gBrush.call(brush); // Already called when gBrush was defined for zoom.filter

    svgTop.call(zoom.transform, d3.zoomIdentity);
});