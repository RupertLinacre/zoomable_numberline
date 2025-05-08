// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function () {
    // Initial configuration
    const config = {
        initialRange: [-100, 100],
        padding: { top: 20, right: 40, bottom: 20, left: 40 }
    };

    // Get container dimensions
    const getContainerDimensions = (selector) => {
        const container = document.querySelector(selector);
        return {
            width: container.clientWidth,
            height: container.clientHeight
        };
    };

    // Create SVG elements for each numberline
    const createSvg = (selector) => {
        const { width, height } = getContainerDimensions(selector);
        return d3.select(selector)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${config.padding.left},${config.padding.top})`);
    };

    // Create SVGs for each numberline
    const topSvg = createSvg('#top-numberline .numberline');
    const middleSvg = createSvg('#middle-numberline .numberline');
    const bottomSvg = createSvg('#bottom-numberline .numberline');

    // Get effective width and height (accounting for padding)
    const getEffectiveDimensions = (selector) => {
        const { width, height } = getContainerDimensions(selector);
        return {
            width: width - config.padding.left - config.padding.right,
            height: height - config.padding.top - config.padding.bottom
        };
    };

    // Create scales for each numberline
    const createXScale = (selector) => {
        const { width } = getEffectiveDimensions(selector);
        return d3.scaleLinear()
            .domain(config.initialRange)
            .range([0, width]);
    };

    // Create scales
    const topXScale = createXScale('#top-numberline .numberline');
    const middleXScale = createXScale('#middle-numberline .numberline');
    const bottomXScale = createXScale('#bottom-numberline .numberline');

    // Function to convert decimal to fraction string
    const decimalToFraction = (decimal) => {
        // Handle special cases
        if (decimal === 0) return "0";
        if (decimal === 1) return "1";
        if (decimal === -1) return "-1";

        // Handle integers
        if (Number.isInteger(decimal)) return decimal.toString();

        // For simple fractions, use predefined mappings
        const commonFractions = {
            0.25: "1/4", 0.5: "1/2", 0.75: "3/4",
            0.2: "1/5", 0.4: "2/5", 0.6: "3/5", 0.8: "4/5",
            0.333: "1/3", 0.667: "2/3",
            0.125: "1/8", 0.375: "3/8", 0.625: "5/8", 0.875: "7/8"
        };

        // Check for negative values
        const isNegative = decimal < 0;
        const absDecimal = Math.abs(decimal);

        // Check if it's a common fraction
        for (const [key, value] of Object.entries(commonFractions)) {
            if (Math.abs(absDecimal - parseFloat(key)) < 0.001) {
                return isNegative ? "-" + value : value;
            }
        }

        // For other values, find the closest simple fraction
        // Extract the integer part
        const intPart = Math.floor(absDecimal);
        const fracPart = absDecimal - intPart;

        if (fracPart < 0.001) {
            return isNegative ? "-" + intPart : intPart.toString();
        }

        // Find closest simple fraction for the fractional part
        let closestDiff = 1;
        let closestFraction = "";

        for (const [key, value] of Object.entries(commonFractions)) {
            const diff = Math.abs(fracPart - parseFloat(key));
            if (diff < closestDiff) {
                closestDiff = diff;
                closestFraction = value;
            }
        }

        // Format the result
        if (intPart === 0) {
            return isNegative ? "-" + closestFraction : closestFraction;
        } else {
            return (isNegative ? "-" : "") + intPart + " " + closestFraction;
        }
    };

    // Create axes with appropriate tick formats
    const createAxis = (scale, tickFormat) => {
        return d3.axisBottom(scale)
            .tickFormat(tickFormat);
    };

    // Create axes
    const topAxis = createAxis(topXScale, d3.format(",.1f"));
    const middleAxis = createAxis(middleXScale, d3.format(",.1f"));
    const bottomAxis = createAxis(bottomXScale, decimalToFraction);

    // Append axes to SVGs
    const appendAxis = (svg, axis, selector) => {
        const { height } = getEffectiveDimensions(selector);
        svg.append('g')
            .attr('class', 'axis')
            .attr('transform', `translate(0,${height / 2})`)
            .call(axis);
    };

    // Append axes
    appendAxis(topSvg, topAxis, '#top-numberline .numberline');
    appendAxis(middleSvg, middleAxis, '#middle-numberline .numberline');
    appendAxis(bottomSvg, bottomAxis, '#bottom-numberline .numberline');

    // Draw the numberline
    const drawNumberline = (svg, selector) => {
        const { width, height } = getEffectiveDimensions(selector);
        svg.append('line')
            .attr('x1', 0)
            .attr('y1', height / 2)
            .attr('x2', width)
            .attr('y2', height / 2)
            .attr('stroke', 'black')
            .attr('stroke-width', 2);
    };

    // Draw numberlines
    drawNumberline(topSvg, '#top-numberline .numberline');
    drawNumberline(middleSvg, '#middle-numberline .numberline');
    drawNumberline(bottomSvg, '#bottom-numberline .numberline');

    // Create brush for top numberline
    const brush = d3.brushX()
        .extent([[0, 0], [getEffectiveDimensions('#top-numberline .numberline').width, getEffectiveDimensions('#top-numberline .numberline').height]])
        .on('brush', brushed)
        .on('end', brushEnded);

    // Append brush to top SVG
    const brushGroup = topSvg.append('g')
        .attr('class', 'brush')
        .call(brush);

    // Initialize with full brush selection
    brushGroup.call(brush.move, [0, getEffectiveDimensions('#top-numberline .numberline').width]);

    // Brush event handlers
    function brushed(event) {
        if (event.sourceEvent && event.sourceEvent.type === "zoom") return; // Ignore brush events from zoom

        if (event.selection) {
            // Convert brush selection to domain values
            const [x0, x1] = event.selection.map(topXScale.invert);

            // Update middle and bottom scales
            middleXScale.domain([x0, x1]);
            bottomXScale.domain([x0, x1]);

            // Update axes
            middleSvg.select('.axis').call(middleAxis);
            bottomSvg.select('.axis').call(bottomAxis);
        }
    }

    function brushEnded(event) {
        if (!event.selection) {
            // If the brush is cleared, reset to initial range
            brushGroup.call(brush.move, [0, getEffectiveDimensions('#top-numberline .numberline').width]);
        }
    }

    // Create zoom behavior for middle and bottom numberlines
    const zoom = d3.zoom()
        .scaleExtent([1, 100])
        .on('zoom', zoomed);

    // Apply zoom to middle and bottom SVGs
    middleSvg.call(zoom);
    bottomSvg.call(zoom);

    // Zoom event handler
    function zoomed(event) {
        // Get the new domain based on the zoom transform
        const newXScale = event.transform.rescaleX(middleXScale);
        const newDomain = newXScale.domain();

        // Update middle and bottom scales with the new domain
        middleXScale.domain(newDomain);
        bottomXScale.domain(newDomain);

        // Update axes
        middleSvg.select('.axis').call(middleAxis);
        bottomSvg.select('.axis').call(bottomAxis);

        // Update brush on top numberline to reflect the visible portion
        const [x0, x1] = newDomain;
        const [brushStart, brushEnd] = [topXScale(x0), topXScale(x1)];

        // Only update brush if it's a user-initiated zoom
        if (event.sourceEvent && event.sourceEvent.type !== "brush") {
            brushGroup.call(brush.move, [brushStart, brushEnd]);
        }
    }

    // Add mousewheel zoom to top numberline
    const topZoom = d3.zoom()
        .scaleExtent([1, 10])
        .on('zoom', topZoomed);

    topSvg.call(topZoom);

    // Top numberline zoom handler
    function topZoomed(event) {
        // Ignore zoom events from brush
        if (event.sourceEvent && event.sourceEvent.type === "brush") return;

        // Get the new domain based on the zoom transform
        const newXScale = event.transform.rescaleX(topXScale);
        const newDomain = newXScale.domain();

        // Update top scale
        topXScale.domain(newDomain);

        // Update top axis
        topSvg.select('.axis').call(topAxis);

        // Update brush extent
        brush.extent([[0, 0], [getEffectiveDimensions('#top-numberline .numberline').width, getEffectiveDimensions('#top-numberline .numberline').height]]);
        brushGroup.call(brush);

        // If there's a current brush selection, update it proportionally
        const currentSelection = d3.brushSelection(brushGroup.node());
        if (currentSelection) {
            const oldDomain = config.initialRange;
            const oldRange = oldDomain[1] - oldDomain[0];
            const newRange = newDomain[1] - newDomain[0];
            const scaleFactor = oldRange / newRange;

            const newSelection = currentSelection.map(d => d * scaleFactor);
            brushGroup.call(brush.move, newSelection);
        }
    }

    // Reset button functionality
    document.getElementById('reset-button').addEventListener('click', resetView);

    function resetView() {
        // Reset scales to initial domain
        topXScale.domain(config.initialRange);
        middleXScale.domain(config.initialRange);
        bottomXScale.domain(config.initialRange);

        // Reset axes
        topSvg.select('.axis').call(topAxis);
        middleSvg.select('.axis').call(middleAxis);
        bottomSvg.select('.axis').call(bottomAxis);

        // Reset zoom transforms
        middleSvg.call(zoom.transform, d3.zoomIdentity);
        bottomSvg.call(zoom.transform, d3.zoomIdentity);
        topSvg.call(topZoom.transform, d3.zoomIdentity);

        // Reset brush to full width
        brushGroup.call(brush.move, [0, getEffectiveDimensions('#top-numberline .numberline').width]);
    }

    // Handle window resize
    window.addEventListener('resize', function () {
        // Get new dimensions
        const topDimensions = getEffectiveDimensions('#top-numberline .numberline');
        const middleDimensions = getEffectiveDimensions('#middle-numberline .numberline');
        const bottomDimensions = getEffectiveDimensions('#bottom-numberline .numberline');

        // Update SVG dimensions
        d3.select('#top-numberline .numberline svg')
            .attr('width', topDimensions.width + config.padding.left + config.padding.right)
            .attr('height', topDimensions.height + config.padding.top + config.padding.bottom);

        d3.select('#middle-numberline .numberline svg')
            .attr('width', middleDimensions.width + config.padding.left + config.padding.right)
            .attr('height', middleDimensions.height + config.padding.top + config.padding.bottom);

        d3.select('#bottom-numberline .numberline svg')
            .attr('width', bottomDimensions.width + config.padding.left + config.padding.right)
            .attr('height', bottomDimensions.height + config.padding.top + config.padding.bottom);

        // Update scales ranges
        topXScale.range([0, topDimensions.width]);
        middleXScale.range([0, middleDimensions.width]);
        bottomXScale.range([0, bottomDimensions.width]);

        // Update axes
        topSvg.select('.axis').call(topAxis);
        middleSvg.select('.axis').call(middleAxis);
        bottomSvg.select('.axis').call(bottomAxis);

        // Update numberlines
        topSvg.select('line')
            .attr('x2', topDimensions.width);
        middleSvg.select('line')
            .attr('x2', middleDimensions.width);
        bottomSvg.select('line')
            .attr('x2', bottomDimensions.width);

        // Update brush extent
        brush.extent([[0, 0], [topDimensions.width, topDimensions.height]]);
        brushGroup.call(brush);

        // If there's a current brush selection, update it proportionally
        const currentSelection = d3.brushSelection(brushGroup.node());
        if (currentSelection) {
            const oldWidth = topDimensions.width;
            const newWidth = getEffectiveDimensions('#top-numberline .numberline').width;
            const scaleFactor = newWidth / oldWidth;

            const newSelection = currentSelection.map(d => d * scaleFactor);
            brushGroup.call(brush.move, newSelection);
        }
    });
});
