(function ($) {
    $.widget('pic.tempHistoryPanel', {
        options: {
            collapsed: false,
            points: [],
            series: {
                pool: { label: 'Pool', color: '#1f77b4', enabled: true },
                spa: { label: 'Spa', color: '#d62728', enabled: true },
                glacier: { label: 'Solar', color: '#2ca02c', enabled: true },
                air: { label: 'Air', color: '#9467bd', enabled: true },
                dewPoint: { label: 'Dew Point', color: '#17becf', enabled: false }
            },
            chart: null,
            hoverPoint: null,
            statusText: '',
            timer: null
        },
        _create: function () {
            var self = this;
            self.options.collapsed = getStorage('picTempHistoryCollapsed', 'true') === 'true';
            self._loadSeriesState();
            self._buildControls();
            if (!self.options.collapsed) self._load();
        },
        _destroy: function () {
            if (this.options.timer) clearInterval(this.options.timer);
            if (this.options.loadTimer) clearTimeout(this.options.loadTimer);
        },
        _buildControls: function () {
            var self = this, el = self.element;
            el.empty().addClass('picTempHistoryEditor').toggleClass('collapsed', self.options.collapsed);
            var title = $('<div class="picCircuitTitle control-panel-title picTempHistoryTitle"></div>').appendTo(el);
            $('<span><i class="fas fa-chart-line"></i> Temperature History</span>').appendTo(title);
            $('<button type="button" class="picTempHistoryCollapse"></button>')
                .attr('title', self.options.collapsed ? 'Expand Temperature History' : 'Collapse Temperature History')
                .append($('<i></i>').addClass(self.options.collapsed ? 'fas fa-chevron-down' : 'fas fa-chevron-up'))
                .appendTo(title)
                .on('click', function () {
                    self.options.collapsed = !self.options.collapsed;
                    setStorage('picTempHistoryCollapsed', self.options.collapsed ? 'true' : 'false');
                    if (self.options.collapsed && self.options.timer) {
                        clearInterval(self.options.timer);
                        self.options.timer = null;
                    }
                    if (self.options.collapsed && self.options.loadTimer) {
                        clearTimeout(self.options.loadTimer);
                        self.options.loadTimer = null;
                    }
                    self._buildControls();
                    if (!self.options.collapsed) self._load();
                });

            if (self.options.collapsed) return;

            var content = $('<div class="picTempHistoryContent"></div>').appendTo(el);
            var now = new Date();
            var start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            var savedStart = getStorage('picTempHistoryStart', self._toDateTimeLocal(start));
            var savedEnd = getStorage('picTempHistoryEnd', self._toDateTimeLocal(now));
            var controls = $('<div class="picTempHistoryControls"></div>').appendTo(content);
            self._field(controls, 'Start', $('<input type="datetime-local" class="picTempHistoryStart">').val(savedStart).on('change', function () {
                setStorage('picTempHistoryStart', this.value);
                self._load();
            }));
            self._field(controls, 'End', $('<input type="datetime-local" class="picTempHistoryEnd">').val(savedEnd).on('change', function () {
                setStorage('picTempHistoryEnd', this.value);
                setStorage('picTempHistoryEndPinned', 'true');
                self._load();
            }));
            $('<label class="picTempHistoryAuto"><input type="checkbox"> Auto refresh</label>').appendTo(controls)
                .find('input').prop('checked', getStorage('picTempHistoryAutoRefresh', 'false') === 'true').on('change', function () {
                    setStorage('picTempHistoryAutoRefresh', this.checked ? 'true' : 'false');
                    self._syncAutoRefresh();
                });
            $('<button type="button" title="Use current time as range end"><i class="fas fa-clock"></i> Now</button>').appendTo(controls).on('click', function () {
                setStorage('picTempHistoryEndPinned', 'false');
                self.element.find('input.picTempHistoryEnd').val(self._toDateTimeLocal(new Date()));
                self._load();
            });
            $('<button type="button"><i class="fas fa-sync"></i> Refresh</button>').appendTo(controls).on('click', function () { self._load(); });

            var toggles = $('<div class="picTempHistoryToggles"></div>').appendTo(content);
            $.each(self.options.series, function (key, series) {
                if (series.hidden) return;
                $('<label></label>')
                    .append($('<input type="checkbox">').prop('checked', series.enabled).on('change', function () {
                        series.enabled = this.checked;
                        self._saveSeriesState();
                        self._renderStats();
                        self._draw();
                    }))
                    .append($('<span></span>').css('border-color', series.color).text(series.label))
                    .appendTo(toggles);
            });
            $('<div class="picTempHistoryStats"></div>').appendTo(content);
            self._renderStats();
            $('<div class="picTempHistoryStatus"></div>').appendTo(content);
            $('<canvas class="picTempHistoryChart" width="720" height="320"></canvas>').appendTo(content)
                .on('mousemove', function (evt) { self._handleHover(evt); })
                .on('mouseleave', function () {
                    self.options.hoverPoint = null;
                    self._status(self.options.statusText);
                    self._draw();
                });
        },
        _field: function (parent, label, input) {
            var row = $('<label class="picTempHistoryField"></label>').appendTo(parent);
            $('<span></span>').text(label).appendTo(row);
            input.appendTo(row);
            return row;
        },
        _load: function () {
            var self = this;
            if (self.options.collapsed) return;
            if (!self._apiReady()) {
                self._status('Waiting for pool controller connection...');
                if (self.options.loadTimer) clearTimeout(self.options.loadTimer);
                self.options.loadTimer = setTimeout(function () { self._load(); }, 500);
                return;
            }
            if (self.options.loadTimer) {
                clearTimeout(self.options.loadTimer);
                self.options.loadTimer = null;
            }
            var startVal = self.element.find('input.picTempHistoryStart').val();
            var endVal = self.element.find('input.picTempHistoryEnd').val();
            if (getStorage('picTempHistoryEndPinned', 'false') !== 'true' || getStorage('picTempHistoryAutoRefresh', 'false') === 'true') {
                endVal = self._toDateTimeLocal(new Date());
                self.element.find('input.picTempHistoryEnd').val(endVal);
            }
            var start = new Date(startVal).getTime();
            var end = new Date(endVal).getTime();
            if (isNaN(start) || isNaN(end) || start >= end) {
                self._status('Select a valid start and end range.');
                return;
            }
            $.getApiService('/state/tempHistory?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end), null, function (data) {
                self._applyTemperatureLabels(data && data.temperatureLabels);
                self.options.points = data && Array.isArray(data.points) ? data.points : [];
                self.options.hoverPoint = null;
                self._buildControls();
                self._status(self.options.points.length + ' samples loaded.');
                self._draw();
            });
            self._syncAutoRefresh();
        },
        _syncAutoRefresh: function () {
            var self = this;
            if (self.options.timer) {
                clearInterval(self.options.timer);
                self.options.timer = null;
            }
            if (self.options.collapsed || getStorage('picTempHistoryAutoRefresh', 'false') !== 'true') return;
            setStorage('picTempHistoryEndPinned', 'false');
            self.options.timer = setInterval(function () {
                if (!self.options.collapsed) self._load();
            }, 5 * 60 * 1000);
        },
        _draw: function () {
            var self = this;
            var canvas = self.element.find('canvas.picTempHistoryChart')[0];
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            var w = canvas.width, h = canvas.height;
            var pad = { left: 48, right: 18, top: 18, bottom: 38 };
            self.options.chart = null;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);
            var points = self.options.points || [];
            var enabledKeys = Object.keys(self.options.series).filter(function (key) { return self.options.series[key].enabled && !self.options.series[key].hidden; });
            if (points.length === 0 || enabledKeys.length === 0) {
                self._emptyChart(ctx, w, h, enabledKeys.length === 0 ? 'No temperature series selected.' : 'No history samples in range.');
                return;
            }
            var minTs = points[0].ts, maxTs = points[0].ts, minTemp, maxTemp;
            points.forEach(function (p) {
                minTs = Math.min(minTs, p.ts);
                maxTs = Math.max(maxTs, p.ts);
                enabledKeys.forEach(function (key) {
                    if (typeof p[key] !== 'number') return;
                    minTemp = typeof minTemp === 'number' ? Math.min(minTemp, p[key]) : p[key];
                    maxTemp = typeof maxTemp === 'number' ? Math.max(maxTemp, p[key]) : p[key];
                });
            });
            if (typeof minTemp !== 'number' || typeof maxTemp !== 'number') {
                self._emptyChart(ctx, w, h, 'No selected temperature values in range.');
                return;
            }
            if (maxTs === minTs) maxTs = minTs + 1;
            if (maxTemp === minTemp) {
                maxTemp += 1;
                minTemp -= 1;
            }
            minTemp = Math.floor(minTemp - 1);
            maxTemp = Math.ceil(maxTemp + 1);
            self.options.chart = { pad: pad, minTs: minTs, maxTs: maxTs, minTemp: minTemp, maxTemp: maxTemp, width: w, height: h, enabledKeys: enabledKeys };
            self._drawAxes(ctx, w, h, pad, minTs, maxTs, minTemp, maxTemp);
            enabledKeys.forEach(function (key) {
                self._drawSeries(ctx, points, key, self.options.series[key].color, pad, w, h, minTs, maxTs, minTemp, maxTemp);
            });
            self._drawHover(ctx);
        },
        _renderStats: function () {
            var panel = this.element.find('div.picTempHistoryStats').empty();
            if (panel.length === 0) return;
            var points = this.options.points || [];
            var keys = this._enabledSeriesKeys();
            if (points.length === 0 || keys.length === 0) {
                $('<div class="picTempHistoryStatsEmpty"></div>').text(keys.length === 0 ? 'No series selected.' : 'No samples loaded.').appendTo(panel);
                return;
            }
            var self = this;
            var grid = $('<div class="picTempHistoryStatsGrid"></div>').appendTo(panel);
            var rows = [];
            keys.forEach(function (key) {
                var stats = self._seriesStats(key);
                if (!stats) return;
                rows.push({ key: key, stats: stats });
            });
            $('<span></span><span></span><span class="picTempHistoryStatHeader">Avg</span><span class="picTempHistoryStatHeader">Min</span><span class="picTempHistoryStatHeader">Max</span><span></span><span></span><span></span><span class="picTempHistoryStatHeader">Avg</span><span class="picTempHistoryStatHeader">Min</span><span class="picTempHistoryStatHeader">Max</span>')
                .appendTo(grid);
            for (var i = 0; i < rows.length; i += 2) {
                var pair = [rows[i], rows[i + 1]];
                pair.forEach(function (row, pairIndex) {
                    if (pairIndex === 1) $('<span></span>').appendTo(grid);
                    if (!row) {
                        $('<span></span><span></span><span></span><span></span><span></span>').appendTo(grid);
                        return;
                    }
                    $('<i></i>').css('background-color', self.options.series[row.key].color).appendTo(grid);
                    $('<span class="picTempHistoryStatName"></span>').text(self.options.series[row.key].label + ':').appendTo(grid);
                    $('<span class="picTempHistoryStatValue"></span>').text(self._formatTemp(row.stats.avg)).appendTo(grid);
                    $('<span class="picTempHistoryStatValue"></span>').text(self._formatTemp(row.stats.min)).appendTo(grid);
                    $('<span class="picTempHistoryStatValue"></span>').text(self._formatTemp(row.stats.max)).appendTo(grid);
                });
            }
            if (rows.length === 0) {
                grid.remove();
                $('<div class="picTempHistoryStatsEmpty"></div>').text('No selected temperature values in range.').appendTo(panel);
            }
        },
        _enabledSeriesKeys: function () {
            return Object.keys(this.options.series).filter(function (key) {
                var series = this.options.series[key];
                return series.enabled && !series.hidden;
            }, this);
        },
        _seriesStats: function (key) {
            var sum = 0, count = 0, min, max;
            (this.options.points || []).forEach(function (point) {
                var value = point[key];
                if (typeof value !== 'number' || isNaN(value)) return;
                sum += value;
                count++;
                min = typeof min === 'number' ? Math.min(min, value) : value;
                max = typeof max === 'number' ? Math.max(max, value) : value;
            });
            if (count === 0) return null;
            return { avg: sum / count, min: min, max: max };
        },
        _formatTemp: function (value) {
            return value.toFixed(1) + 'F';
        },
        _drawAxes: function (ctx, w, h, pad, minTs, maxTs, minTemp, maxTemp) {
            ctx.strokeStyle = '#bbb';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pad.left, pad.top);
            ctx.lineTo(pad.left, h - pad.bottom);
            ctx.lineTo(w - pad.right, h - pad.bottom);
            ctx.stroke();
            ctx.fillStyle = '#555';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (var i = 0; i <= 4; i++) {
                var temp = minTemp + ((maxTemp - minTemp) * i / 4);
                var y = h - pad.bottom - ((temp - minTemp) / (maxTemp - minTemp)) * (h - pad.top - pad.bottom);
                ctx.fillText(temp.toFixed(0) + 'F', pad.left - 6, y);
                ctx.strokeStyle = '#eee';
                ctx.beginPath();
                ctx.moveTo(pad.left, y);
                ctx.lineTo(w - pad.right, y);
                ctx.stroke();
            }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(new Date(minTs).toLocaleString(), pad.left + 70, h - pad.bottom + 10);
            ctx.fillText(new Date(maxTs).toLocaleString(), w - pad.right - 90, h - pad.bottom + 10);
        },
        _drawSeries: function (ctx, points, key, color, pad, w, h, minTs, maxTs, minTemp, maxTemp) {
            var chartW = w - pad.left - pad.right;
            var chartH = h - pad.top - pad.bottom;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            var started = false;
            points.forEach(function (p) {
                if (typeof p[key] !== 'number') return;
                var x = pad.left + ((p.ts - minTs) / (maxTs - minTs)) * chartW;
                var y = h - pad.bottom - ((p[key] - minTemp) / (maxTemp - minTemp)) * chartH;
                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                }
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        },
        _handleHover: function (evt) {
            var self = this, chart = self.options.chart;
            if (!chart) return;
            var canvas = self.element.find('canvas.picTempHistoryChart')[0];
            if (!canvas) return;
            var rect = canvas.getBoundingClientRect();
            var scaleX = canvas.width / rect.width;
            var scaleY = canvas.height / rect.height;
            var x = (evt.clientX - rect.left) * scaleX;
            var y = (evt.clientY - rect.top) * scaleY;
            var pad = chart.pad;
            if (x < pad.left || x > chart.width - pad.right || y < pad.top || y > chart.height - pad.bottom) {
                self.options.hoverPoint = null;
                self._status(self.options.statusText);
                self._draw();
                return;
            }
            var targetTs = chart.minTs + ((x - pad.left) / (chart.width - pad.left - pad.right)) * (chart.maxTs - chart.minTs);
            var nearest = self._nearestPoint(targetTs, chart.enabledKeys);
            self.options.hoverPoint = nearest;
            self._renderHover(nearest);
            self._draw();
        },
        _nearestPoint: function (targetTs, enabledKeys) {
            var nearest, nearestDelta = Number.MAX_VALUE;
            (this.options.points || []).forEach(function (p) {
                var hasValue = enabledKeys.some(function (key) { return typeof p[key] === 'number'; });
                if (!hasValue) return;
                var delta = Math.abs(p.ts - targetTs);
                if (delta < nearestDelta) {
                    nearest = p;
                    nearestDelta = delta;
                }
            });
            return nearest;
        },
        _drawHover: function (ctx) {
            var chart = this.options.chart, point = this.options.hoverPoint;
            if (!chart || !point) return;
            var pad = chart.pad;
            var chartW = chart.width - pad.left - pad.right;
            var chartH = chart.height - pad.top - pad.bottom;
            var x = pad.left + ((point.ts - chart.minTs) / (chart.maxTs - chart.minTs)) * chartW;
            ctx.save();
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(x, pad.top);
            ctx.lineTo(x, chart.height - pad.bottom);
            ctx.stroke();
            ctx.setLineDash([]);
            chart.enabledKeys.forEach(function (key) {
                if (typeof point[key] !== 'number') return;
                var y = chart.height - pad.bottom - ((point[key] - chart.minTemp) / (chart.maxTemp - chart.minTemp)) * chartH;
                ctx.fillStyle = this.options.series[key].color;
                ctx.beginPath();
                ctx.arc(x, y, 3.5, 0, Math.PI * 2);
                ctx.fill();
            }, this);
            ctx.restore();
        },
        _renderHover: function (point) {
            var panel = this.element.find('div.picTempHistoryStatus').empty();
            if (!point) return;
            $('<span class="picTempHistoryHoverTime"></span>').text(new Date(point.ts).toLocaleString()).appendTo(panel);
            var self = this;
            var values = (self.options.chart.enabledKeys || [])
                .filter(function (key) { return typeof point[key] === 'number'; })
                .sort(function (a, b) { return point[b] - point[a]; });
            values.forEach(function (key) {
                $('<span class="picTempHistoryHoverValue"></span>')
                    .append($('<i></i>').css('background-color', self.options.series[key].color))
                    .append(document.createTextNode(self.options.series[key].label + ': ' + point[key].toFixed(1) + 'F'))
                    .appendTo(panel);
            });
            if (values.length === 0) this._status(this.options.statusText);
        },
        _emptyChart: function (ctx, w, h, text) {
            ctx.fillStyle = '#777';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, w / 2, h / 2);
        },
        _status: function (text) {
            this.options.statusText = text || '';
            this.element.find('div.picTempHistoryStatus').text(this.options.statusText);
        },
        _apiReady: function () {
            return makeBool($('body').attr('data-apiproxy')) || !!$('body').attr('data-apiserviceurl');
        },
        _toDateTimeLocal: function (date) {
            var pad = function (n) { return String(n).padStart(2, '0'); };
            return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
                'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
        },
        _loadSeriesState: function () {
            try {
                var saved = JSON.parse(getStorage('picTempHistorySeries', '{}'));
                $.each(this.options.series, function (key, series) {
                    if (typeof saved[key] === 'boolean') series.enabled = saved[key];
                });
            } catch (err) { }
        },
        _applyTemperatureLabels: function (temperatureLabels) {
            var solar = temperatureLabels && temperatureLabels.solar ? temperatureLabels.solar : {};
            this.options.series.glacier.label = solar.label || 'Solar';
            this.options.series.glacier.hidden = solar.show === false;
            if (this.options.series.glacier.hidden) this.options.series.glacier.enabled = false;
        },
        _saveSeriesState: function () {
            var saved = {};
            $.each(this.options.series, function (key, series) { saved[key] = series.enabled; });
            setStorage('picTempHistorySeries', JSON.stringify(saved));
        }
    });
})(jQuery);
