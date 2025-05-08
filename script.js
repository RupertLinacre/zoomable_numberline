document.addEventListener('DOMContentLoaded', function () {
    const initialDomain = [-100, 100];

    let svg, gTop, gMid, gBot, gBrush;
    let xTop, xMid, xBot;
    let xAxisTop, xAxisMid, xAxisBot;
    let brushBehavior, zoomTopBehavior, zoomMidBehavior, zoomBotBehavior;

    let currentTopTransform = d3.zoomIdentity;
    let currentFocusTransform = d3.zoomIdentity;

    // Store initial scales (domain: initialDomain, range: calculated based on width)
    // These are used as the basis for zoom transforms (event.transform.rescaleX(xInitial))
    let xTopInitial, xMidInitial, xBotInitial;

    const margin = { top: 20, right: 50, bottom: 30, left: 50 };
    const sectionPadding = 60; // Vertical padding between numberlines
    const fixedSectionHeight = 100; // Each numberline area is 100px tall

    let fullWidth, fullHeight;
    let usableWidth; // usableHeight is effectively fixedSectionHeight per section
    // let sectionHeight; // This will now be fixedSectionHeight

    function setupDimensions() {
        const container = document.getElementById('chart-container');
        fullWidth = container.clientWidth;
        // Calculate fullHeight based on fixed section heights and paddings
        // This ensures the SVG viewBox is sized correctly for the content.
        fullHeight = (fixedSectionHeight * 3) + (sectionPadding * 2) + margin.top + margin.bottom;

        usableWidth = fullWidth - margin.left - margin.right;
        // sectionHeight is now globally fixedSectionHeight
    }

    // Greatest Common Divisor function
    function gcd(a, b) {
        return b ? gcd(b, a % b) : Math.abs(a);
    }

    // Tick formatting functions
    function formatDecimalTick(d, domainSpan) {
        if (Number.isInteger(d)) return d.toString();

        let precision;
        if (domainSpan <= 0.0001) { // e.g., 0.00001 to 0.00002
            precision = 5;
        } else if (domainSpan <= 0.001) { // e.g., 0.0001 to 0.0002
            precision = 4;
        } else if (domainSpan <= 0.01) { // e.g., 0.001 to 0.002
            precision = 3;
        } else if (domainSpan <= 0.1) { // e.g., 0.01 to 0.02
            precision = 2;
        } else if (domainSpan <= 10) { // e.g., 0.1 to 0.2 or 1 to 2
            precision = 1;
        } else { // Larger spans
            precision = 0;
        }

        // Use toFixed for precision, then remove unnecessary trailing zeros.
        let s = d.toFixed(precision);
        if (s.includes('.')) {
            s = s.replace(/\.?0+$/, ''); // Remove trailing zeros and potentially the decimal point if it becomes trailing
        }
        return s === "" ? "0" : s; // Handle case where everything after decimal is removed for numbers like 0.00
    }

    // Enhanced formatFractionTick that considers the domain span for appropriate denominators
    function formatFractionTick(d, domainSpan) {
        if (d === 0) return "0";
        if (Number.isInteger(d)) return d.toString();

        const tolerance = 1e-5;
        let commonDenominators;

        // Adjust denominators based on the visible domain span
        if (domainSpan <= 1) { // Very zoomed in, e.g. showing 0 to 1
            commonDenominators = [2, 4, 8, 16, 3, 6, 12, 5, 10]; // Show finer fractions
        } else if (domainSpan <= 5) { // Zoomed in, e.g., 0 to 5
            commonDenominators = [2, 3, 4, 5, 6, 8, 10];
        } else if (domainSpan <= 20) { // Medium zoom
            commonDenominators = [2, 3, 4, 5, 6, 8];
        } else if (domainSpan <= 50) { // Slightly zoomed out
            commonDenominators = [2, 3, 4, 5];
        } else { // Zoomed out (large span)
            commonDenominators = [2, 4]; // Only show halves, quarters for very wide views
        }

        for (const den of commonDenominators) {
            // Ensure we don't create overly complex fractions for the given denominator
            // e.g., if den is 16, but the number is 0.5, prefer 1/2 over 8/16.
            // The gcd simplification handles this, but this logic helps select appropriate denominators.

            if (Math.abs(d * den - Math.round(d * den)) < tolerance) {
                let num = Math.round(d * den);
                const commonDivisor = gcd(num, den);
                const simplifiedNum = num / commonDivisor;
                const simplifiedDen = den / commonDivisor;

                if (simplifiedDen === 1) return simplifiedNum.toString();
                return `${simplifiedNum}/${simplifiedDen}`;
            }
        }
        // Fallback for less common fractions (e.g., 1/7) or if precision is an issue
        // Continued fraction method (simplified)
        let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
        let b = d;
        do {
            let a = Math.floor(b);
            let aux = h1; h1 = a * h1 + h2; h2 = aux;
            aux = k1; k1 = a * k1 + k2; k2 = aux;
            b = 1 / (b - a);
        } while (Math.abs(d - h1 / k1) > d * tolerance && k1 < 30); // Limit denominator for simplicity

        if (k1 === 0 || h1 / k1 === d || k1 > 30) return d.toFixed(1).replace(/\.0$/, ''); // Fallback to decimal
        if (k1 === 1) return h1.toString();
        if (h1 % k1 === 0) return (h1 / k1).toString();

        const finalNum = h1;
        const finalDen = k1;
        const commonDiv = gcd(finalNum, finalDen);

        return `${finalNum / commonDiv}/${finalDen / commonDiv}`;
    }


    function init() {
        setupDimensions();

        svg = d3.select("#numberlines-svg")
            .attr("viewBox", `0 0 ${fullWidth} ${fullHeight}`);

        svg.selectAll("*").remove(); // Clear previous elements if re-init

        // Create main groups for each numberline, translated vertically
        gTop = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        gMid = svg.append("g").attr("transform", `translate(${margin.left},${margin.top + fixedSectionHeight + sectionPadding})`);
        gBot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top + 2 * (fixedSectionHeight + sectionPadding)})`);

        // Define scales (x-position)
        xTop = d3.scaleLinear().domain(initialDomain).range([0, usableWidth]);
        xMid = d3.scaleLinear().domain(initialDomain).range([0, usableWidth]);
        xBot = d3.scaleLinear().domain(initialDomain).range([0, usableWidth]);

        // Store initial scales for zoom calculations
        xTopInitial = xTop.copy();
        xMidInitial = xMid.copy();
        xBotInitial = xBot.copy();

        // Define axes
        // Axes will be configured dynamically based on zoom level for their tickFormat
        const initialTopDomainSpan = xTop.domain()[1] - xTop.domain()[0];
        xAxisTop = d3.axisBottom(xTop).ticks(10).tickFormat(d => formatDecimalTick(d, initialTopDomainSpan));

        const initialMidDomainSpan = xMid.domain()[1] - xMid.domain()[0];
        xAxisMid = d3.axisBottom(xMid).ticks(20).tickFormat(d => formatDecimalTick(d, initialMidDomainSpan));

        const initialBotDomainSpan = xBot.domain()[1] - xBot.domain()[0];
        xAxisBot = d3.axisBottom(xBot).ticks(20).tickFormat(d => formatFractionTick(d, initialBotDomainSpan));

        // Draw axes
        gTop.append("g").attr("class", "axis axis-top").attr("transform", `translate(0, ${fixedSectionHeight / 2})`).call(xAxisTop);
        gMid.append("g").attr("class", "axis axis-mid").attr("transform", `translate(0, ${fixedSectionHeight / 2})`).call(xAxisMid);
        gBot.append("g").attr("class", "axis axis-bot").attr("transform", `translate(0, ${fixedSectionHeight / 2})`).call(xAxisBot);

        // --- Brush for Top Numberline ---
        brushBehavior = d3.brushX()
            .extent([[0, 0], [usableWidth, fixedSectionHeight]]) // Use fixedSectionHeight
            .on("brush end", brushed);

        gBrush = gTop.append("g").attr("class", "brush").call(brushBehavior);
        // Set initial brush selection to cover the full initial domain
        gBrush.call(brushBehavior.move, xTop.range());


        // --- Zoom Behaviors ---
        // Zoom for Top Numberline (Mousewheel only)
        zoomTopBehavior = d3.zoom()
            .scaleExtent([0.1, 20]) // Min/max zoom level for top
            .translateExtent([[-Infinity, 0], [Infinity, fixedSectionHeight]]) // Pan extent
            .filter(event => event.type === 'wheel') // Only mousewheel zoom
            .on("zoom", zoomedTop);

        gTop.append("rect")
            .attr("class", "numberline-background")
            .attr("width", usableWidth)
            .attr("height", fixedSectionHeight) // Use fixedSectionHeight
            .style("cursor", "ns-resize") // Indicates vertical scroll/zoom
            .call(zoomTopBehavior);


        // Zoom for Middle Numberline (Mousewheel and Drag)
        // Limit zoom-in: max scale of 20 means domain can be 1/20th of initial, e.g. 10 units wide if initial is 200.
        // To prevent infinite zoom-in, the minimum domain width should be something sensible, e.g. 1 unit.
        // If initialDomain width is 200 (-100 to 100), max zoom factor k = 200 / 1 = 200.
        // Let's set max zoom to 50 for now, meaning smallest visible range is 200/50 = 4 units.
        // Updated to allow much greater zoom-in, effectively "infinite"
        zoomMidBehavior = d3.zoom()
            .scaleExtent([0.01, 2000000]) // Min zoom out 0.01, Max zoom in 2,000,000
            .translateExtent([[-Infinity, 0], [Infinity, fixedSectionHeight]]) // Use fixedSectionHeight
            .on("zoom", zoomedMid);

        gMid.append("rect")
            .attr("class", "numberline-background zoom-rect-mid")
            .attr("width", usableWidth)
            .attr("height", fixedSectionHeight) // Use fixedSectionHeight
            .style("cursor", "move")
            .call(zoomMidBehavior);

        // Zoom for Bottom Numberline (Mousewheel and Drag)
        // Updated to allow much greater zoom-in
        zoomBotBehavior = d3.zoom()
            .scaleExtent([0.01, 2000000]) // Min zoom out 0.01, Max zoom in 2,000,000
            .translateExtent([[-Infinity, 0], [Infinity, fixedSectionHeight]]) // Use fixedSectionHeight
            .on("zoom", zoomedBot);

        gBot.append("rect")
            .attr("class", "numberline-background zoom-rect-bot")
            .attr("width", usableWidth)
            .attr("height", fixedSectionHeight) // Use fixedSectionHeight
            .style("cursor", "move")
            .call(zoomBotBehavior);

        // Reset button
        d3.select("#resetButton").on("click", resetViews);
    }

    // --- Event Handlers ---

    function brushed(event) {
        if (!event.sourceEvent) return; // Ignore programmatic brush events

        const selection = event.selection;
        if (selection) {
            const newFocusDomain = selection.map(xTop.invert);
            currentFocusTransform = d3.zoomIdentity
                .scale(usableWidth / (xTopInitial(newFocusDomain[1]) - xTopInitial(newFocusDomain[0])))
                .translate(-xTopInitial(newFocusDomain[0]), 0);

            // Apply this new transform to focus lines
            gMid.select(".zoom-rect-mid").call(zoomMidBehavior.transform, currentFocusTransform);
            gBot.select(".zoom-rect-bot").call(zoomBotBehavior.transform, currentFocusTransform);

            // Direct update of domains and axes after transform call (zoom handlers will also run)
            xMid.domain(newFocusDomain);
            xBot.domain(newFocusDomain);

            const currentMidDomainSpan = xMid.domain()[1] - xMid.domain()[0];
            xAxisMid.tickFormat(d => formatDecimalTick(d, currentMidDomainSpan));

            const currentBotDomainSpan = xBot.domain()[1] - xBot.domain()[0];
            xAxisBot.tickFormat(d => formatFractionTick(d, currentBotDomainSpan));

            gMid.select(".axis-mid").call(xAxisMid);
            gBot.select(".axis-bot").call(xAxisBot);

        } else { // Brush cleared (e.g., double click) - reset focus to top's current view
            const topDomain = xTop.domain(); // This is the current xTop domain after its own zoom
            currentFocusTransform = d3.zoomIdentity
                .scale(usableWidth / (xTopInitial(topDomain[1]) - xTopInitial(topDomain[0])))
                .translate(-xTopInitial(topDomain[0]), 0);

            gMid.select(".zoom-rect-mid").call(zoomMidBehavior.transform, currentFocusTransform);
            gBot.select(".zoom-rect-bot").call(zoomBotBehavior.transform, currentFocusTransform);

            xMid.domain(topDomain); // Focus lines adopt top's current view
            xBot.domain(topDomain);

            const currentMidDomainSpan = xMid.domain()[1] - xMid.domain()[0];
            xAxisMid.tickFormat(d => formatDecimalTick(d, currentMidDomainSpan));

            const currentBotDomainSpan = xBot.domain()[1] - xBot.domain()[0];
            xAxisBot.tickFormat(d => formatFractionTick(d, currentBotDomainSpan));

            gMid.select(".axis-mid").call(xAxisMid);
            gBot.select(".axis-bot").call(xAxisBot);
        }
    }

    function zoomedTop(event) {
        if (!event.sourceEvent) return; // Ignore programmatic zoom
        currentTopTransform = event.transform;
        xTop.domain(currentTopTransform.rescaleX(xTopInitial).domain());

        const currentTopDomainSpan = xTop.domain()[1] - xTop.domain()[0];
        xAxisTop.tickFormat(d => formatDecimalTick(d, currentTopDomainSpan));
        gTop.select(".axis-top").call(xAxisTop);

        updateBrushFromFocusDomain(xMid.domain()); // Update brush based on focus lines' current domain
    }

    function zoomedMid(event) {
        if (!event.sourceEvent) return; // Ignore programmatic zoom
        currentFocusTransform = event.transform;
        applyFocusZoomAndSync(zoomBotBehavior, gBot.select(".zoom-rect-bot"));
    }

    function zoomedBot(event) {
        if (!event.sourceEvent) return; // Ignore programmatic zoom
        currentFocusTransform = event.transform;
        applyFocusZoomAndSync(zoomMidBehavior, gMid.select(".zoom-rect-mid"));
    }

    function applyFocusZoomAndSync(otherZoomBehavior, otherZoomRect) {
        const newFocusDomain = currentFocusTransform.rescaleX(xMidInitial).domain(); // Use xMidInitial as reference

        xMid.domain(newFocusDomain);
        xBot.domain(newFocusDomain);

        const currentMidDomainSpan = xMid.domain()[1] - xMid.domain()[0];
        xAxisMid.tickFormat(d => formatDecimalTick(d, currentMidDomainSpan));

        const currentBotDomainSpan = xBot.domain()[1] - xBot.domain()[0];
        xAxisBot.tickFormat(d => formatFractionTick(d, currentBotDomainSpan));

        gMid.select(".axis-mid").call(xAxisMid);
        gBot.select(".axis-bot").call(xAxisBot);

        // Synchronize the other focus numberline's zoom state
        otherZoomRect.call(otherZoomBehavior.transform, currentFocusTransform);

        updateBrushFromFocusDomain(newFocusDomain);
    }

    function updateBrushFromFocusDomain(focusDomain) {
        if (!gBrush || !xTop) return; // Not initialized yet

        const selection = [
            xTop(focusDomain[0]),
            xTop(focusDomain[1])
        ];

        // Clamp selection to the visible range of xTop to avoid errors
        const topRange = xTop.range();
        const clampedSelection = [
            Math.max(topRange[0], Math.min(topRange[1], selection[0])),
            Math.max(topRange[0], Math.min(topRange[1], selection[1]))
        ];

        // Only move brush if selection is valid (e.g., not NaN, start < end)
        if (clampedSelection && !isNaN(clampedSelection[0]) && !isNaN(clampedSelection[1]) && clampedSelection[1] > clampedSelection[0]) {
            // Temporarily remove the listener to prevent feedback loop, or rely on !event.sourceEvent
            gBrush.call(brushBehavior.move, clampedSelection);
        } else if (clampedSelection && clampedSelection[1] <= clampedSelection[0]) {
            // If the domain is inverted or too small, consider clearing the brush or a minimal brush
            // For now, do nothing if selection is invalid to avoid errors
        }
    }

    function resetViews() {
        currentTopTransform = d3.zoomIdentity;
        currentFocusTransform = d3.zoomIdentity;

        xTop.domain(initialDomain);
        xMid.domain(initialDomain);
        xBot.domain(initialDomain);

        xTopInitial.domain(initialDomain); // ensure initial scales are also reset if they were modified
        xMidInitial.domain(initialDomain);
        xBotInitial.domain(initialDomain);


        const resetTopDomainSpan = xTop.domain()[1] - xTop.domain()[0];
        xAxisTop.tickFormat(d => formatDecimalTick(d, resetTopDomainSpan));
        gTop.select(".axis-top").call(xAxisTop);

        const resetMidDomainSpan = xMid.domain()[1] - xMid.domain()[0];
        xAxisMid.tickFormat(d => formatDecimalTick(d, resetMidDomainSpan));
        gMid.select(".axis-mid").call(xAxisMid);

        const resetBotDomainSpan = xBot.domain()[1] - xBot.domain()[0];
        xAxisBot.tickFormat(d => formatFractionTick(d, resetBotDomainSpan));
        gBot.select(".axis-bot").call(xAxisBot);

        // Reset zoom transforms on the elements
        gTop.select(".numberline-background").call(zoomTopBehavior.transform, d3.zoomIdentity);
        gMid.select(".zoom-rect-mid").call(zoomMidBehavior.transform, d3.zoomIdentity);
        gBot.select(".zoom-rect-bot").call(zoomBotBehavior.transform, d3.zoomIdentity);

        // Reset brush to full extent
        if (gBrush && xTop) {
            gBrush.call(brushBehavior.move, xTop.range());
        }
    }

    // Initial call
    init();

    // Optional: Redraw on window resize for true responsiveness
    window.addEventListener('resize', () => {
        // Simple re-init. For complex apps, might update scales/ranges instead.
        init();
        // After re-init, transforms might be lost, re-apply if needed or reset.
        // For this app, re-init starts fresh, which is acceptable.
        // Or, smarter resize:
        // setupDimensions();
        // xTop.range([0, usableWidth]); ... etc for all scales
        // xTopInitial.range([0, usableWidth]); ...
        // Redraw all axes
        // Update brush position and zoom transforms based on current domains
        // This is more complex than a full re-init.
    });
});
