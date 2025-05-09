document.addEventListener('DOMContentLoaded', () => {
    const initialState = {
        domain: [-100, 100],
        brushExtent: [-10, 10],
        detailZoom: {
            decimals: d3.zoomIdentity,
            fractions: d3.zoomIdentity
        }
    };

    let state = JSON.parse(JSON.stringify(initialState)); // Deep copy

    const dispatcher = d3.dispatch("stateChange");

    const svgHeight = 100;
    const svgMargin = { top: 20, right: 30, bottom: 30, left: 30 }; // Margin for labels etc.

    // --- Helper Functions ---
    function gcd(a, b) {
        return b ? gcd(b, a % b) : a;
    }

    function formatFraction(value) {
        if (Math.abs(value - Math.round(value)) < 1e-9) { // Check if it's a whole number
            return Math.round(value).toString();
        }

        const sign = value < 0 ? "-" : "";
        const absValue = Math.abs(value);
        const wholePart = Math.floor(absValue);
        const decimalPart = absValue - wholePart;

        if (decimalPart < 1e-9) { // Should have been caught by first check, but just in case
            return sign + wholePart.toString();
        }

        // Common denominators for child-friendly fractions
        const denominators = [2, 3, 4, 5, 6, 8, 10, 12];
        let bestFit = { n: 0, d: 1, diff: Infinity };

        for (const d of denominators) {
            const n = Math.round(decimalPart * d);
            if (n === 0 && wholePart === 0 && decimalPart > 1e-9) { // Avoid 0/d for non-zero decimals
                if (d === denominators[0]) { // for very small fractions, represent as 1/max_denominator if n is 0
                    let temp_n = 1;
                    let temp_d = denominators[denominators.length - 1];
                    const common = gcd(temp_n, temp_d);
                    if (Math.abs(decimalPart - (temp_n / temp_d)) < bestFit.diff) {
                        bestFit = { n: temp_n / common, d: temp_d / common, diff: Math.abs(decimalPart - (temp_n / temp_d)) };
                    }
                }
                continue;
            }
            if (n === 0 && wholePart > 0) continue; // if decimal part is ~0 and there's a whole, don't show 0/d

            const common = gcd(n, d);
            const currentNum = n / common;
            const currentDen = d / common;
            const diff = Math.abs(decimalPart - (currentNum / currentDen));

            if (diff < bestFit.diff) {
                bestFit = { n: currentNum, d: currentDen, diff: diff };
            } else if (diff === bestFit.diff && currentDen < bestFit.d) { // Prefer smaller denominator if diff is same
                bestFit = { n: currentNum, d: currentDen, diff: diff };
            }
        }

        // If after checking all denominators, the best fit numerator is 0 (and it's not a whole number)
        // it means the fraction is very small. We might default to showing it as a decimal or 1/largest_denom.
        // For simplicity here, if bestFit.n is 0 and decimalPart is not effectively 0, it will show 0/d or just whole.
        // A more robust solution might show more decimal places or a smaller fraction like 1/16, 1/32 if needed.
        if (bestFit.n === 0 && decimalPart > 1e-5) { // if it's a tiny fraction not well represented
            // Try to show as 1/d for smallest d that makes sense or just use decimal.
            // For this version, we will stick to the chosen denominators. If n is 0, it implies it's closer to 0/d than 1/d for chosen ds.
            if (wholePart === 0) return sign + "0"; // Or format decimal value more precisely if needed
            // else it will just show the whole part
        }


        if (bestFit.n === 0) { // Fraction part is zero or negligible
            return sign + wholePart.toString();
        }

        if (wholePart === 0) {
            return sign + bestFit.n + "/" + bestFit.d;
        }
        return sign + wholePart + " " + bestFit.n + "/" + bestFit.d;
    }

    // --- Numberline Components ---

    function TopNumberline(containerSelector) {
        const container = d3.select(containerSelector);
        let svg, width, xScale, xAxis, gX, brush, zoomBehavior;

        function setup() {
            container.select("svg").remove(); // Clear previous
            const W = container.node().getBoundingClientRect().width;
            width = W - svgMargin.left - svgMargin.right;

            svg = container.append("svg")
                .attr("width", W)
                .attr("height", svgHeight);

            xScale = d3.scaleLinear().range([0, width]);
            xAxis = d3.axisBottom(xScale).ticks(10);

            gX = svg.append("g")
                .attr("transform", `translate(${svgMargin.left},${svgHeight / 2})`)
                .attr("class", "axis top-axis");

            // Brush
            brush = d3.brushX()
                .extent([[0, -svgHeight / 4 + svgHeight / 2 - 20], [width, svgHeight / 4 + svgHeight / 2 + 20]]) // Centered vertically
                .on("end", brushed); // Use "end" to avoid rapid updates during brushing

            svg.append("g")
                .attr("class", "brush")
                .attr("transform", `translate(${svgMargin.left},0)`) // Align with axis
                .call(brush);

            // Zoom
            zoomBehavior = d3.zoom()
                .scaleExtent([0.1, 100]) // Example scale extent
                .translateExtent([[-Infinity, -Infinity], [Infinity, Infinity]]) // Allow panning anywhere initially
                .extent([[0, 0], [width, svgHeight - svgMargin.top - svgMargin.bottom]])
                .on("zoom", zoomed);

            svg.append("rect") // Invisible rect for zoom
                .attr("width", width)
                .attr("height", svgHeight - svgMargin.top - svgMargin.bottom)
                .attr("transform", `translate(${svgMargin.left},${svgMargin.top})`)
                .style("fill", "none")
                .style("pointer-events", "all")
                .call(zoomBehavior)
                .on("dblclick.zoom", null); // Disable double click zoom reset if needed
        }

        function brushed(event) {
            if (!event.sourceEvent) return; // Ignore programmatic brush changes
            if (!event.selection) { // If brush is cleared
                // Potentially reset to a default or do nothing, for now, we require a selection
                // Or re-apply state.brushExtent if it's somehow cleared by user action beyond normal.
                // For this version, if selection is cleared, we will wait for next programmatic update or user brush.
                return;
            }
            const newBrushExtent = event.selection.map(xScale.invert);

            // Clamp brush extent to current domain
            const [domainMin, domainMax] = state.domain;
            const clampedBrushMin = Math.max(domainMin, newBrushExtent[0]);
            const clampedBrushMax = Math.min(domainMax, newBrushExtent[1]);

            if (clampedBrushMin >= clampedBrushMax) { // If brush is invalid or outside
                // This case should ideally be handled by the main controller logic
                // when domain changes, but as a fallback:
                const newDomainWidth = state.domain[1] - state.domain[0];
                state.brushExtent = [
                    state.domain[0] + newDomainWidth * 0.45,
                    state.domain[0] + newDomainWidth * 0.55
                ];
            } else {
                state.brushExtent = [clampedBrushMin, clampedBrushMax];
            }

            state.detailZoom.decimals = d3.zoomIdentity;
            state.detailZoom.fractions = d3.zoomIdentity;
            dispatcher.call("stateChange", this, state);
        }

        function zoomed(event) {
            if (!event.sourceEvent) return; // Ignore programmatic zoom changes

            const newDomain = event.transform.rescaleX(xScale).domain();
            state.domain = newDomain;

            // Update brushExtent based on new domain
            let [brushMin, brushMax] = state.brushExtent;
            brushMin = Math.max(newDomain[0], brushMin);
            brushMax = Math.min(newDomain[1], brushMax);

            if (brushMin >= brushMax) { // Brush is outside or collapsed
                const range = newDomain[1] - newDomain[0];
                const center = (newDomain[0] + newDomain[1]) / 2;
                let defaultWidth = Math.min(20, range * 0.2); // Ensure positive width
                if (range <= 0) defaultWidth = 20; // fallback if range is zero or negative

                let newBrushStart = center - defaultWidth / 2;
                let newBrushEnd = center + defaultWidth / 2;

                state.brushExtent = [
                    Math.max(newDomain[0], newBrushStart),
                    Math.min(newDomain[1], newBrushEnd)
                ];
                // Ensure brush extent is still valid
                if (state.brushExtent[0] >= state.brushExtent[1]) {
                    state.brushExtent[0] = newDomain[0];
                    state.brushExtent[1] = Math.min(newDomain[0] + defaultWidth, newDomain[1]);
                    if (state.brushExtent[0] >= state.brushExtent[1] && newDomain[0] < newDomain[1]) { // final check
                        state.brushExtent[1] = newDomain[1];
                    }
                }

            } else {
                state.brushExtent = [brushMin, brushMax];
            }

            state.detailZoom.decimals = d3.zoomIdentity;
            state.detailZoom.fractions = d3.zoomIdentity;
            dispatcher.call("stateChange", this, state);
        }

        this.update = function (currentState) {
            if (!svg) setup();

            xScale.domain(currentState.domain);
            gX.call(xAxis.scale(xScale));

            // Programmatically move brush
            const brushSelection = [xScale(currentState.brushExtent[0]), xScale(currentState.brushExtent[1])];
            svg.select(".brush").call(brush.move, brushSelection.map(d => Math.max(0, Math.min(width, d)))); // Clamp to visible width

            // Update zoom transform to reflect current domain if changed externally (e.g. reset)
            // This ensures the zoom behavior's internal state matches the chart's scale.
            const currentZoomTransform = d3.zoomTransform(svg.select("rect").node());
            const newXScaleForZoom = d3.scaleLinear().domain(currentState.domain).range([0, width]);

            if (currentZoomTransform.rescaleX(newXScaleForZoom).domain()[0] !== xScale.domain()[0] ||
                currentZoomTransform.rescaleX(newXScaleForZoom).domain()[1] !== xScale.domain()[1]) {
                // This part is tricky: we need to set the zoom transform without triggering its event if it's from reset.
                // For now, the zoom event handles sourceEvent check.
                // We create a new transform that would result in the current xScale's domain.
                // If k=1, tx = -xScale(0) * k where xScale(0) is effectively the shift from an original [0, width] domain.
                // More generally, if original scale S_orig maps D_orig to R, and new scale S_new maps D_new to R,
                // and S_new(x) = (x - D_new[0]) * R_width / (D_new[1] - D_new[0])
                // The transform t applied to S_orig such that t.rescaleX(S_orig).domain() == D_new
                // t.k = (D_orig[1]-D_orig[0]) / (D_new[1]-D_new[0])
                // t.x = -D_new[0] * t.k
                // For simplicity here, the primary driving force for domain is user zoom or reset.
                // The zoom object's transform should ideally be updated when state.domain changes.
                // This can be done by calculating the necessary k and x, or by temporarily detaching the listener.
                // For a reset:
                if (JSON.stringify(currentState.domain) === JSON.stringify(initialState.domain)) {
                    svg.select("rect").call(zoomBehavior.transform, d3.zoomIdentity);
                }
            }
        };
        this.resize = setup;
    }

    function DetailNumberline(containerSelector, type, initialStateSlice) {
        const container = d3.select(containerSelector);
        let svg, width, xScale, xAxis, gX, zoomBehavior;

        function setup() {
            container.select("svg").remove();
            const W = container.node().getBoundingClientRect().width;
            width = W - svgMargin.left - svgMargin.right;

            svg = container.append("svg")
                .attr("width", W)
                .attr("height", svgHeight);

            xScale = d3.scaleLinear().range([0, width]);

            if (type === 'fractions') {
                xAxis = d3.axisBottom(xScale).tickFormat(formatFraction).ticks(5);
            } else {
                xAxis = d3.axisBottom(xScale).ticks(10);
            }

            gX = svg.append("g")
                .attr("transform", `translate(${svgMargin.left},${svgHeight / 2})`)
                .attr("class", `axis ${type}-axis`);

            zoomBehavior = d3.zoom()
                // scaleExtent and translateExtent will be set in update based on brushExtent
                .extent([[0, 0], [width, svgHeight - svgMargin.top - svgMargin.bottom]])
                .on("zoom", zoomed);

            svg.append("rect")
                .attr("width", width)
                .attr("height", svgHeight - svgMargin.top - svgMargin.bottom)
                .attr("transform", `translate(${svgMargin.left},${svgMargin.top})`)
                .style("fill", "none")
                .style("pointer-events", "all")
                .call(zoomBehavior)
                .on("dblclick.zoom", null);
        }

        function zoomed(event) {
            if (!event.sourceEvent) return;
            state.detailZoom[type] = event.transform;
            dispatcher.call("stateChange", this, state); // Only this detail view needs update
        }

        this.update = function (currentState) {
            if (!svg) setup();

            const currentBrushExtent = currentState.brushExtent;
            const localZoomTransform = currentState.detailZoom[type];

            xScale.domain(currentBrushExtent);

            // Apply local zoom to the scale for this view
            const zoomedXScale = localZoomTransform.rescaleX(xScale);

            gX.call(xAxis.scale(zoomedXScale));
            if (type === 'fractions') {
                // Dynamic tick count for fractions based on zoomed range to avoid clutter
                const visibleDomainWidth = Math.abs(zoomedXScale.domain()[1] - zoomedXScale.domain()[0]);
                let numTicks = 5;
                if (visibleDomainWidth < 1) numTicks = 3;
                if (visibleDomainWidth < 0.1) numTicks = 2;
                if (visibleDomainWidth > 50) numTicks = 7;
                gX.call(xAxis.scale(zoomedXScale).ticks(numTicks).tickFormat(formatFraction));
            } else {
                gX.call(xAxis.scale(zoomedXScale));
            }


            // Update zoom behavior constraints
            // User should not be able to pan outside currentBrushExtent
            // User should not be able to zoom out beyond showing currentBrushExtent
            const minScale = 1; // Cannot zoom out further than brushExtent
            const maxScale = Math.max(100, (currentBrushExtent[1] - currentBrushExtent[0]) / 0.01); // Max zoom to avoid tiny ranges, or a fixed large number

            zoomBehavior.scaleExtent([minScale, maxScale]);

            // Translate extent: convert brushExtent (domain values) to pixel coordinates
            // for the *untransformed* scale.
            // The zoom behavior applies its transform *after* these extents are considered.
            // So, if scale is at identity (k=1), translateExtent is [0, width].
            // If zoomed in (k>1), it can pan within a smaller effective pixel range.
            // D3's zoom.translateExtent applies to the view coordinates.
            // It should be [[0, -Infinity], [width, Infinity]] to allow vertical pan if any,
            // but constrain horizontal pan based on the *zoomed content*.
            // The effective domain should remain within brushExtent.
            // t_x is current translation of zoom. k is current scale.
            // Domain_new = (Domain_orig - t_x) / k
            // We want Domain_new to be within brushExtent.
            // So, [pixel_coord_brush_min, pixel_coord_brush_max] becomes the range for the *transformed* axis.
            // [xScale(brushExtent[0]), xScale(brushExtent[1])] is [0, width].
            // The viewable extent is [0, width]. The content can be panned such that
            // the part of content corresponding to brushExtent[0] doesn't go past 0,
            // and brushExtent[1] doesn't go past width.

            // Let S be the scale mapping brushExtent to [0, width].
            // Let T be the current detail zoom transform. S' = T.rescaleX(S).
            // We want S'.domain() to be constrained effectively by brushExtent.
            // The zoom behavior should not allow S'(0) < brushExtent[0] or S'(width) > brushExtent[1].
            // This is complex to set directly. The easiest way is to restrict the transform itself.
            // The `localZoomTransform` is what defines the current view. We need to ensure it doesn't
            // pan/zoom "too far".
            // The `zoom.translateExtent` is based on the *original* untransformed scale's coordinates.
            // So, if the original scale maps `brushExtent` to `[0, width]`, then `translateExtent` should ensure that
            // `transform.applyX(0)` is not less than `xScale(brushExtent[0])` (which is 0)
            // and `transform.applyX(width)` is not greater than `xScale(brushExtent[1])` (which is `width`).
            // This means `k*x_orig + tx`.
            // tx_min = -k * brushExtent_pixel_max + width
            // tx_max = -k * brushExtent_pixel_min
            // This needs careful thought based on D3's zoom.translateExtent API.
            // For now, the provided zoom extent on the rect combined with scaleExtent provides basic constraints.
            // A simpler approach: keep translateExtent fixed to [[0,0], [width, height]] for the rect
            // and scaleExtent as defined. The content itself (ticks) will be rescaled.
            // The user won't be able to pan content outside the brushExtent IF the scaleExtent[0] is 1.
            // If they zoom in, they can pan within that zoomed view of the brushExtent.

            zoomBehavior.translateExtent([[0, -Infinity], [width, Infinity]]); // Allow full pan within current zoom.

            // Reset zoom transform if it's identity (e.g. after brush change)
            if (localZoomTransform.k === 1 && localZoomTransform.x === 0 && localZoomTransform.y === 0) {
                svg.select("rect").call(zoomBehavior.transform, d3.zoomIdentity);
            }
        };
        this.resize = setup;
    }

    // --- Initialize Components ---
    const topChart = new TopNumberline("#topNumberline");
    const decimalChart = new DetailNumberline("#decimalNumberline", "decimals", state.detailZoom.decimals);
    const fractionChart = new DetailNumberline("#fractionNumberline", "fractions", state.detailZoom.fractions);

    // --- Central Update Function & Event Listener ---
    function updateAllViews(sourceState) {
        topChart.update(sourceState);
        decimalChart.update(sourceState);
        fractionChart.update(sourceState);
    }

    dispatcher.on("stateChange.controller", (newStateFromEvent) => {
        // The event handlers within components already modified 'state'.
        // So 'state' is the single source of truth.
        // We just need to re-render.
        // However, the specific update paths in the prompt are important:
        // - Zooming/panning top: updates all three.
        // - Brushing top: updates both detail views.
        // - Zooming/panning detail: updates only that detail view.

        // For simplicity and robustness, the current dispatcher call will update all.
        // Fine-tuning would involve passing which component initiated the change
        // or having separate dispatch events. Given the current setup where components
        // directly modify the shared 'state' then call 'stateChange', a full re-render
        // based on the new 'state' is the most straightforward.

        updateAllViews(state);
    });

    // --- Reset Button ---
    document.getElementById("resetButton").addEventListener("click", () => {
        state = JSON.parse(JSON.stringify(initialState)); // Deep copy
        // Manually reset zoom transforms on the SVG elements for detail views if needed,
        // because d3.zoomIdentity in state needs to be applied.
        // The update function should handle applying d3.zoomIdentity.
        dispatcher.call("stateChange", this, state); // Signal state has reset
    });

    // --- Responsive Resizing ---
    function handleResize() {
        // Re-setup and update all charts
        topChart.resize();
        decimalChart.resize();
        fractionChart.resize();
        updateAllViews(state);
    }

    new ResizeObserver(handleResize).observe(document.querySelector(".app-container"));

    // --- Initial Render ---
    handleResize(); // Initial setup and render based on current size
});