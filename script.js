const margin = { left: 40, right: 40, top: 20, bottom: 20 };
const chartHeight = 100; // Height for each numberline (including margins)
const innerH = chartHeight - margin.top - margin.bottom;
const FUNNEL_SPACING = 40; // Vertical space between the two numberlines

// --- Central state & dispatcher ---
const INIT_TOP_DOMAIN = [-2, 10];
const INIT_BRUSH_EXTENT = [0, 2];
const INIT_DETAIL_DOMAIN = null;
const state = {
    topDomain: [...INIT_TOP_DOMAIN],
    brushExtent: [...INIT_BRUSH_EXTENT],
    detailDomain: INIT_DETAIL_DOMAIN    // null → use brushExtent
};
const bus = d3.dispatch('stateChanged');

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
const mainSvg = mainChartContainer.append('svg');

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
    const currentDetailDisplayDomain = state.detailDomain || state.brushExtent;
    const base = d3.scaleLinear()
        .domain(currentDetailDisplayDomain)
        .range([0, width]);
    const mid = base.invert(mx);
    const factor = Math.exp(event.deltaY * DET_SENS);

    let [d0, d1] = base.domain();
    let n0 = mid + (d0 - mid) * factor;
    let n1 = mid + (d1 - mid) * factor;

    state.detailDomain = [n0, n1];
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

    const domain = state.detailDomain || state.brushExtent;
    const dtXScale = d3.scaleLinear().domain(domain).range([0, width]);
    dtAxisG.call(d3.axisBottom(dtXScale).ticks(15));

    // Always attach wheel event for zooming on the detail number line
    dtG.on('wheel', event => {
        event.preventDefault();
        const [mx] = d3.pointer(event, dtG.node());
        const base = d3.scaleLinear().domain(state.detailDomain || state.brushExtent).range([0, width]);
        const mid = base.invert(mx);
        const factor = Math.exp(event.deltaY * DET_SENS);

        let [d0, d1] = base.domain();
        let n0 = mid + (d0 - mid) * factor;
        let n1 = mid + (d1 - mid) * factor;

        state.detailDomain = [n0, n1];
        bus.call('stateChanged');
    });
}
bus.on('stateChanged.updateDetail', updateDetail);

function updateFunnelLines() {
    const width = mainChartContainer.node().clientWidth - margin.left - margin.right;
    if (width <= 0) return;

    // Y-coordinates
    const y1_funnel = margin.top + innerH;
    // The axis line in the detail chart is at y = dtG_yOffset + innerH (axis is at bottom of detail chart group)
    // But the axis line is relative to the detail group, so its absolute y is:
    // dtG_yOffset + innerH
    // However, the axis visually sits at the bottom of the detail chart's allocated area, so we should subtract margin.bottom
    const y2_funnel = dtG_yOffset + innerH; // - margin.bottom; // Remove subtraction, axis is at this y

    // X-coordinates for the top chart (brush extent)
    const x_start_top_funnel = margin.left + xScale(state.brushExtent[0]);
    const x_end_top_funnel = margin.left + xScale(state.brushExtent[1]);

    // X-coordinates for the detail chart (corresponding to brush extent values)
    const detailDisplayDomain = state.detailDomain || state.brushExtent;
    const tempDetailScale = d3.scaleLinear().domain(detailDisplayDomain).range([0, width]);
    const x_start_bottom_funnel = margin.left + tempDetailScale(state.brushExtent[0]);
    const x_end_bottom_funnel = margin.left + tempDetailScale(state.brushExtent[1]);

    // Draw the blue funnel area
    const points = [
        [x_start_top_funnel, y1_funnel],
        [x_end_top_funnel, y1_funnel],
        [x_end_bottom_funnel, y2_funnel],
        [x_start_bottom_funnel, y2_funnel]
    ];
    funnelArea.attr('points', points.map(p => p.join(",")).join(" "));

    // Draw the blue funnel lines
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
}
bus.on('stateChanged.updateFunnelLines', updateFunnelLines);

// resize trigger
window.addEventListener('resize', () => bus.call('stateChanged'));

// initial render: validate then render
bus.call('stateChanged');
