const margin = { left: 40, right: 40, top: 20, bottom: 20 };
const chartHeight = 100; // Height for each numberline (including margins)
const innerH = chartHeight - margin.top - margin.bottom;
const FUNNEL_SPACING = 40; // Vertical space between the two numberlines
// Define a tolerance factor for the bottom numberline
const TOLERANCE_FACTOR = 0.07;
// --- Central state & dispatcher ---
const INIT_TOP_DOMAIN = [-2, 10]; // Adjusted to add more padding and ensure zero is visible
const INIT_BRUSH_EXTENT = [0, 2];
const INIT_DETAIL_DOMAIN = null;
const DETAIL_DOMAIN_PADDING_FACTOR = 0.03; // 3% padding factor
const state = {
    topDomain: [...INIT_TOP_DOMAIN],
    brushExtent: [...INIT_BRUSH_EXTENT],
    detailDomain: INIT_DETAIL_DOMAIN,    // null → use brushExtent
    detailDisplayMode: 'decimal' // 'decimal' | 'fraction'
};
const bus = d3.dispatch('stateChanged');

// --- Helper functions for padding ---
function getPaddedDomain(domain, paddingFactor) {
    if (!domain) return null; // Should not happen if called correctly
    const [d0, d1] = domain;
    const span = d1 - d0;
    const paddingAmount = span * paddingFactor;
    return [d0 - paddingAmount, d1 + paddingAmount];
}

function getUnpaddedDomain(paddedDomain, paddingFactor) {
    if (!paddedDomain) return null; // Should not happen
    const [pd0, pd1] = paddedDomain;
    const paddedSpan = pd1 - pd0;

    const denominator = 1 + 2 * paddingFactor;
    if (denominator <= 0) {
        console.warn("Cannot unpad with current paddingFactor:", paddingFactor);
        return [...paddedDomain]; // Return original padded domain
    }

    const originalSpan = paddedSpan / denominator;
    const totalPaddingAdded = paddedSpan - originalSpan;
    const singleSidePaddingAmount = totalPaddingAdded / 2;

    return [pd0 + singleSidePaddingAmount, pd1 - singleSidePaddingAmount];
}

// --- Reset button handler ---
document.addEventListener('DOMContentLoaded', () => {
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            state.topDomain = [...INIT_TOP_DOMAIN];
            state.brushExtent = [...INIT_BRUSH_EXTENT];
            state.detailDomain = INIT_DETAIL_DOMAIN;
            state.detailDisplayMode = 'decimal';
            const toggleBtnInstance = document.getElementById('toggleDetailModeBtn');
            if (toggleBtnInstance) {
                if (state.detailDisplayMode === 'decimal') {
                    toggleBtnInstance.textContent = 'Show Fractions on Detail';
                } else {
                    toggleBtnInstance.textContent = 'Hide Fractions on Detail';
                }
            }
            bus.call('stateChanged');
        });
    }

    const toggleBtn = document.getElementById('toggleDetailModeBtn');
    if (toggleBtn) {
        const updateButtonText = () => {
            if (state.detailDisplayMode === 'decimal') {
                toggleBtn.textContent = 'Show Fractions on Detail';
            } else {
                toggleBtn.textContent = 'Hide Fractions on Detail';
            }
        };
        updateButtonText();
        toggleBtn.addEventListener('click', () => {
            state.detailDisplayMode = (state.detailDisplayMode === 'decimal') ? 'fraction' : 'decimal';
            updateButtonText();
            bus.call('stateChanged');
        });
    }
});
// --- Fraction axis helpers ---
const ALLOWED_DENOMINATORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 25, 30, 40, 50, 60, 100];
const MIN_FRACTION_TICKS = 8;
const MAX_FRACTION_TICKS = 24;

function findBestDenominator(domain, allowedDenominators, minTicks, maxTicks) {
    if (!domain) return null;
    const [d0, d1] = domain;
    if (d0 >= d1) return null;
    let bestDenom = null;
    for (const denom of allowedDenominators) {
        const firstNumerator = Math.ceil(d0 * denom);
        const lastNumerator = Math.floor(d1 * denom);
        const numTicks = lastNumerator - firstNumerator + 1;
        if (numTicks >= minTicks && numTicks <= maxTicks) {
            bestDenom = denom;
            break;
        }
    }
    if (!bestDenom && allowedDenominators.length > 0) {
        let fallbackDenom = null;
        let maxVisibleTicks = 0;
        for (const denom of allowedDenominators) {
            const firstNumerator = Math.ceil(d0 * denom);
            const lastNumerator = Math.floor(d1 * denom);
            const numTicks = lastNumerator - firstNumerator + 1;
            if (numTicks >= 1 && numTicks > maxVisibleTicks && numTicks <= maxTicks * 1.5) {
                maxVisibleTicks = numTicks;
                fallbackDenom = denom;
            }
        }
        bestDenom = fallbackDenom;
    }
    return bestDenom;
}

function generateFractionTickValues(domain, denominator) {
    if (!domain || !denominator) return [];
    const [d0, d1] = domain;
    const tickValues = [];
    const firstNumerator = Math.ceil(d0 * denominator);
    const lastNumerator = Math.floor(d1 * denominator);
    for (let num = firstNumerator; num <= lastNumerator; num++) {
        tickValues.push(num / denominator);
    }
    return tickValues;
}

function formatTickAsFraction(chosenDenominator) {
    return function (value) {
        const tolerance = 1e-9;
        const numerator = Math.round(value * chosenDenominator);
        const absNumerator = Math.abs(numerator);
        const sign = numerator < 0 ? '-' : '';
        if (Math.abs(numerator) < tolerance) return "0";
        if (Math.abs(numerator % chosenDenominator) < tolerance) {
            return (numerator / chosenDenominator).toString();
        }
        if (absNumerator > chosenDenominator) {
            const whole = Math.trunc(numerator / chosenDenominator);
            const remainder = absNumerator % chosenDenominator;
            return `${sign}${Math.abs(whole)} ${remainder}/${chosenDenominator}`;
        }
        return `${numerator}/${chosenDenominator}`;
    };
}

// --- Info panel update ---
function updateInfoPanel() {
    const info = document.getElementById('infoPanel');
    if (!info) return;
    const [t0, t1] = state.topDomain;
    const [b0, b1] = state.brushExtent;
    info.innerHTML = `
        <b>Top numberline:</b> min = <span>${t0.toFixed(3)}</span>, max = <span>${t1.toFixed(3)}</span><br>
        <b>Brush:</b> min = <span>${b0.toFixed(3)}</span>, max = <span>${b1.toFixed(3)}</span>
    `;
}
bus.on('stateChanged.infoPanel', updateInfoPanel);

// --- Constraint enforcement (centralized) ---
function enforceConstraints() {
    // 1. Ensure topDomain encloses brushExtent (prevents zooming past selection)
    {
        const [b0, b1] = state.brushExtent;
        let [t0, t1] = state.topDomain;
        t0 = Math.min(t0, b0);
        t1 = Math.max(t1, b1);
        state.topDomain = [t0, t1];
    }

    // 2. Ensure detailDomain stays within topDomain and sync brushExtent
    if (state.detailDomain) {
        const [d0, d1] = state.detailDomain;
        const [t0, t1] = state.topDomain;
        const start = Math.max(d0, t0);
        const end = Math.min(d1, t1);
        if (start >= end) {
            state.detailDomain = [t0, t1];
        } else {
            state.detailDomain = [start, end];
        }
        // Sync brushExtent whenever detailDomain is explicit
        state.brushExtent = [...state.detailDomain];
    }
}
bus.on('stateChanged.validate', enforceConstraints);

bus.on('stateChanged.updateTop', updateTop);
bus.on('stateChanged.updateDetail', updateDetail);

// --- MAIN SVG AND CHART SETUP ---
const mainChartContainer = d3.select('#mainChartContainer');
const mainSvg = mainChartContainer.append('svg').attr('overflow', 'visible');

// --- TOP CHART GROUP SETUP ---
let xScale = d3.scaleLinear().domain(state.topDomain).range([0, 0]);
const xAxis = d3.axisBottom(xScale).ticks(15);

const topG = mainSvg.append('g')
    .attr('id', 'topG')
    .attr('transform', `translate(${margin.left},${margin.top})`);

// Add a background rect to topG to capture wheel events
topG.append('rect')
    .attr('class', 'event-capture-rect')
    .attr('height', innerH); // Width set in updateTop

const axisG = topG.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`);

const brushG = topG.append('g').attr('class', 'brush');

// Brush behavior (no change in logic, just where it's applied)
const brush = d3.brushX()
    .extent([[0, 0], [0, innerH]]) // Extent width updated in updateTop
    .on('brush', event => {
        if (!event.sourceEvent) return;
        const currentWidth = mainChartContainer.node().clientWidth - margin.left - margin.right;
        const tempXScale = xScale.copy().range([0, currentWidth]);
        state.brushExtent = event.selection.map(tempXScale.invert);
        state.detailDomain = null;
        bus.call('stateChanged');
    })
    .on('end', event => {
        if (!event.sourceEvent) return;
        const currentWidth = mainChartContainer.node().clientWidth - margin.left - margin.right;
        const tempXScale = xScale.copy().range([0, currentWidth]);
        if (event.selection) {
            state.brushExtent = event.selection.map(tempXScale.invert);
        }
        state.detailDomain = null;
        bus.call('stateChanged');
    });

// Top chart wheel-zoom (attached to topG)
const TOP_SENS = 0.0005;
topG.on('wheel', event => {
    event.preventDefault();
    const [mx] = d3.pointer(event, topG.node());
    const currentWidth = mainChartContainer.node().clientWidth - margin.left - margin.right;
    const tempXScale = xScale.copy().range([0, currentWidth]);
    const mid = tempXScale.invert(mx);
    const factor = Math.exp(event.deltaY * TOP_SENS);

    const [d0, d1] = state.topDomain;
    state.topDomain = [mid + (d0 - mid) * factor, mid + (d1 - mid) * factor];
    bus.call('stateChanged');
});

// --- DETAIL CHART GROUP SETUP ---

const dtG_yOffset = margin.top + innerH + margin.bottom + FUNNEL_SPACING + margin.top;
const dtG = mainSvg.append('g')
    .attr('id', 'dtG')
    .attr('transform', `translate(${margin.left},${dtG_yOffset})`);

// Add a background rect to dtG to capture wheel events
dtG.append('rect')
    .attr('class', 'event-capture-rect')
    .attr('height', innerH); // Width set in updateDetail

const dtAxisG = dtG.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`);

// Group for the additional fraction labels (above the axis line)
const fractionLabelsG = dtG.append('g')
    .attr('class', 'fraction-labels')
    .attr('transform', `translate(0, ${innerH})`);

// Detail chart wheel-zoom (attached to dtG)
const DET_SENS = 0.0005;
dtG.on('wheel', event => {
    event.preventDefault();
    const [mx] = d3.pointer(event, dtG.node());
    const width = mainChartContainer.node().clientWidth - margin.left - margin.right;

    const coreDetailDomain = state.detailDomain || state.brushExtent;
    const displayedDetailDomain = getPaddedDomain(coreDetailDomain, DETAIL_DOMAIN_PADDING_FACTOR);

    const baseScale = d3.scaleLinear()
        .domain(displayedDetailDomain)
        .range([0, width]);

    const mid = baseScale.invert(mx);
    const factor = Math.exp(event.deltaY * DET_SENS);

    let [d0_displayed, d1_displayed] = baseScale.domain();
    let new_displayed_0 = mid + (d0_displayed - mid) * factor;
    let new_displayed_1 = mid + (d1_displayed - mid) * factor;
    const newZoomedDisplayedDomain = [new_displayed_0, new_displayed_1];

    const newCoreDomain = getUnpaddedDomain(newZoomedDisplayedDomain, DETAIL_DOMAIN_PADDING_FACTOR);

    state.detailDomain = newCoreDomain;
    bus.call('stateChanged');
});

// --- FUNNEL AREA & LINES SETUP ---
const funnelArea = mainSvg.append('polygon').attr('class', 'funnel-area');
const funnelLine1 = mainSvg.append('line').attr('class', 'funnel-line');
const funnelLine2 = mainSvg.append('line').attr('class', 'funnel-line');

// --- UPDATE FUNCTIONS ---
function updateTop() {
    const width = mainChartContainer.node().clientWidth - margin.left - margin.right;
    const extraBottom = 20;
    const totalSvgHeight = chartHeight + FUNNEL_SPACING + chartHeight + extraBottom;

    mainSvg
        .attr('width', width + margin.left + margin.right)
        .attr('height', totalSvgHeight);

    topG.select('rect.event-capture-rect').attr('width', width);

    xScale.domain(state.topDomain).range([0, width]);
    axisG.call(xAxis);

    // Remove any previous custom ticks
    topG.selectAll('.custom-top-tick').remove();

    // Use only one tick per label, and make them light (#e0e0e0)
    let mainTickValues = xScale.ticks(15);
    const y1_funnel = innerH; // axis line
    const y1_top = 0; // top of the numberline
    topG.selectAll('.custom-top-tick')
        .data(mainTickValues)
        .enter()
        .append('line')
        .attr('class', 'custom-top-tick')
        .attr('x1', d => xScale(d))
        .attr('x2', d => xScale(d))
        .attr('y1', y1_funnel)
        .attr('y2', y1_top)
        .attr('stroke', '#e0e0e0')
        .attr('stroke-width', 1)
        .attr('pointer-events', 'none');

    brush.extent([[0, 0], [width, innerH]]);
    brushG.call(brush);
    brushG.call(brush.move, state.brushExtent.map(xScale));

    // Remove any previous custom brush lines
    brushG.selectAll('.custom-brush-line').remove();

    // Draw custom brush lines to match funnel lines
    const brushX = state.brushExtent.map(xScale);
    brushG.append('line')
        .attr('class', 'custom-brush-line')
        .attr('x1', brushX[0])
        .attr('y1', 0)
        .attr('x2', brushX[0])
        .attr('y2', innerH)
        .attr('stroke', '#3399ff')
        .attr('stroke-width', 2)
        .attr('pointer-events', 'none');
    brushG.append('line')
        .attr('class', 'custom-brush-line')
        .attr('x1', brushX[1])
        .attr('y1', 0)
        .attr('x2', brushX[1])
        .attr('y2', innerH)
        .attr('stroke', '#3399ff')
        .attr('stroke-width', 2)
        .attr('pointer-events', 'none');
}
bus.on('stateChanged.updateTop', updateTop);

function updateDetail() {
    const width = mainChartContainer.node().clientWidth - margin.left - margin.right;
    dtG.select('rect.event-capture-rect').attr('width', width);

    const coreDomain = state.detailDomain || state.brushExtent;
    const displayDomain = getPaddedDomain(coreDomain, DETAIL_DOMAIN_PADDING_FACTOR);

    const dtXScale = d3.scaleLinear().domain(displayDomain).range([0, width]);
    const detailAxis = d3.axisBottom(dtXScale);

    // Always clear previous custom fraction labels before redrawing or hiding
    fractionLabelsG.selectAll('text').remove();

    // Always reset opacity of all axis elements before drawing axis (prevents stale opacity)
    dtAxisG.selectAll('text').style('opacity', 1);
    dtAxisG.selectAll('g.tick line').style('opacity', 1);
    dtAxisG.selectAll('path.domain').style('opacity', 1);

    // Remove any previous custom ticks
    dtG.selectAll('.custom-detail-tick').remove();

    let mainTickValues = [];
    let bestDenom = null;
    let fractionTickValues = [];

    if (state.detailDisplayMode === 'fraction') {
        bestDenom = findBestDenominator(displayDomain, ALLOWED_DENOMINATORS, MIN_FRACTION_TICKS, MAX_FRACTION_TICKS);
        if (bestDenom) {
            fractionTickValues = generateFractionTickValues(displayDomain, bestDenom);
            mainTickValues = fractionTickValues;
            detailAxis.tickValues(mainTickValues).tickFormat(d => {
                let str = Number(d).toPrecision(4);
                str = str.replace(/(\.[0-9]*[1-9])0+$/, '$1');
                str = str.replace(/\.0+$/, '');
                return str;
            });

            // Render fraction labels above the axis line, same size as decimals (2em)
            fractionLabelsG.selectAll('text')
                .data(mainTickValues)
                .join('text')
                .attr('x', d => dtXScale(d))
                .attr('y', -10)
                .attr('text-anchor', 'middle')
                .attr('fill', '#0057b8')
                .style('font-size', null)
                .text(d => formatTickAsFraction(bestDenom)(d));

            fractionLabelsG.style('display', null);
        } else {
            // Fallback: No suitable denominator found, behave like decimal mode
            detailAxis.ticks(10).tickFormat(d => {
                let str = Number(d).toPrecision(4);
                str = str.replace(/(\.[0-9]*[1-9])0+$/, '$1');
                str = str.replace(/\.0+$/, '');
                return str;
            });
            mainTickValues = detailAxis.scale().ticks(10);
            fractionLabelsG.style('display', 'none');
        }
    } else {
        // Set all decimal axis label opacity to 1 when not showing fractions (bottom numberline only)
        dtAxisG.selectAll('text').style('opacity', 1);
        dtAxisG.selectAll('g.tick line').style('opacity', 1);
        dtAxisG.selectAll('path.domain').style('opacity', 1);
        // Standard decimal ticks, formatted to 3 significant figures
        detailAxis.ticks(15).tickFormat(d => {
            let str = Number(d).toPrecision(4);
            str = str.replace(/(\.[0-9]*[1-9])0+$/, '$1');
            str = str.replace(/\.0+$/, '');
            return str;
        });
        mainTickValues = detailAxis.scale().ticks(15);
        fractionLabelsG.style('display', 'none');
    }

    // Remove default tick lines (but keep labels)
    detailAxis.tickSize(0);
    dtAxisG.call(detailAxis);

    // Calculate the vertical extent for the ticks (should match the shaded area/vertical lines)
    // y2_funnel is the top of the shaded area in the detail chart
    const y_axis = innerH;
    const y_shaded_top = 0;
    // Only one tick per label, and make them light (#e0e0e0)
    dtG.selectAll('.custom-detail-tick')
        .data(mainTickValues)
        .enter()
        .append('line')
        .attr('class', 'custom-detail-tick')
        .attr('x1', d => dtXScale(d))
        .attr('x2', d => dtXScale(d))
        .attr('y1', y_axis)
        .attr('y2', y_shaded_top)
        .attr('stroke', '#e0e0e0')
        .attr('stroke-width', 1)
        .attr('pointer-events', 'none');

    // If in fraction mode, fade the decimal axis labels
    if (state.detailDisplayMode === 'fraction') {
        dtAxisG.selectAll('text').style('opacity', 0.33);
        dtAxisG.selectAll('g.tick line').style('opacity', 0);
        dtAxisG.selectAll('path.domain').style('opacity', 0.33);
    } else {
        dtAxisG.selectAll('g.tick line').style('opacity', 0);
    }
}
bus.on('stateChanged.updateDetail', updateDetail);

function updateFunnelLines() {
    const width = mainChartContainer.node().clientWidth - margin.left - margin.right;
    if (width <= 0) return;

    const y1_funnel = margin.top + innerH; // Top axis
    const y2_funnel = dtG_yOffset + innerH - innerH; // Stop above the decimal axis, where vertical lines start

    const x_start_top_funnel = margin.left + xScale(state.brushExtent[0]);
    const x_end_top_funnel = margin.left + xScale(state.brushExtent[1]);

    const coreDetailDomain = state.detailDomain || state.brushExtent;
    const displayDetailDomain = getPaddedDomain(coreDetailDomain, DETAIL_DOMAIN_PADDING_FACTOR);

    const tempDetailScale = d3.scaleLinear().domain(displayDetailDomain).range([0, width]);

    const x_start_bottom_funnel = margin.left + tempDetailScale(state.brushExtent[0]);
    const x_end_bottom_funnel = margin.left + tempDetailScale(state.brushExtent[1]);

    const points = [
        [x_start_top_funnel, y1_funnel],
        [x_end_top_funnel, y1_funnel],
        [x_end_bottom_funnel, y2_funnel],
        [x_start_bottom_funnel, y2_funnel]
    ];
    funnelArea.attr('points', points.map(p => p.join(",")).join(" "));

    funnelLine1
        .attr('x1', x_start_top_funnel)
        .attr('y1', y1_funnel)
        .attr('x2', x_start_bottom_funnel)
        .attr('y2', y2_funnel);

    funnelLine2
        .attr('x1', x_end_top_funnel)
        .attr('y1', y1_funnel)
        .attr('x2', x_end_bottom_funnel)
        .attr('y2', y2_funnel);

    // Add vertical lines from the bottom funnel points with the same height as the brush
    mainSvg.selectAll('.vertical-line').remove(); // Clear previous vertical lines

    mainSvg.append('line')
        .attr('class', 'vertical-line')
        .attr('x1', x_start_bottom_funnel)
        .attr('y1', y2_funnel)
        .attr('x2', x_start_bottom_funnel)
        .attr('y2', dtG_yOffset + innerH)
        .attr('stroke', '#3399ff')
        .attr('stroke-width', 2);

    mainSvg.append('line')
        .attr('class', 'vertical-line')
        .attr('x1', x_end_bottom_funnel)
        .attr('y1', y2_funnel)
        .attr('x2', x_end_bottom_funnel)
        .attr('y2', dtG_yOffset + innerH)
        .attr('stroke', '#3399ff')
        .attr('stroke-width', 2);

    // Add shading between the vertical lines
    mainSvg.selectAll('.shaded-area').remove(); // Clear previous shaded areas

    mainSvg.append('rect')
        .attr('class', 'shaded-area')
        .attr('x', x_start_bottom_funnel)
        .attr('y', y2_funnel)
        .attr('width', x_end_bottom_funnel - x_start_bottom_funnel)
        .attr('height', dtG_yOffset + innerH - y2_funnel)
        .attr('fill', '#3399ff')
        .attr('opacity', 0.2)
        .attr('pointer-events', 'none');
}
bus.on('stateChanged.updateFunnelLines', updateFunnelLines);

// resize trigger
window.addEventListener('resize', () => bus.call('stateChanged'));

// initial render: validate then render
bus.call('stateChanged');
