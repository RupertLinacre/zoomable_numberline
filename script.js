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
    detailDomain: INIT_DETAIL_DOMAIN    // null → use brushExtent
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
            bus.call('stateChanged');
        });
    }
});

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
    dtAxisG.call(d3.axisBottom(dtXScale).ticks(15));
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
