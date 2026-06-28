(function ($) {
    $.widget('pic.tempHistoryPanel', {
        options: {
            collapsed: false,
            points: [],
            series: {
                pool: { label: 'Pool', color: '#1f77b4', enabled: true },
                spa: { label: 'Spa', color: '#d62728', enabled: true },
                glacier: { label: 'Glacier', color: '#2ca02c', enabled: true },
                air: { label: 'Air', color: '#9467bd', enabled: true }
            },
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
                $('<label></label>')
                    .append($('<input type="checkbox">').prop('checked', series.enabled).on('change', function () {
                        series.enabled = this.checked;
                        self._saveSeriesState();
                        self._draw();
                    }))
                    .append($('<span></span>').css('border-color', series.color).text(series.label))
                    .appendTo(toggles);
            });
            $('<div class="picTempHistoryStatus"></div>').appendTo(content);
            $('<canvas class="picTempHistoryChart" width="720" height="320"></canvas>').appendTo(content);
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
                self.options.points = data && Array.isArray(data.points) ? data.points : [];
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
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);
            var points = self.options.points || [];
            var enabledKeys = Object.keys(self.options.series).filter(function (key) { return self.options.series[key].enabled; });
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
            self._drawAxes(ctx, w, h, pad, minTs, maxTs, minTemp, maxTemp);
            enabledKeys.forEach(function (key) {
                self._drawSeries(ctx, points, key, self.options.series[key].color, pad, w, h, minTs, maxTs, minTemp, maxTemp);
            });
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
        _emptyChart: function (ctx, w, h, text) {
            ctx.fillStyle = '#777';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, w / 2, h / 2);
        },
        _status: function (text) {
            this.element.find('div.picTempHistoryStatus').text(text || '');
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
        _saveSeriesState: function () {
            var saved = {};
            $.each(this.options.series, function (key, series) { saved[key] = series.enabled; });
            setStorage('picTempHistorySeries', JSON.stringify(saved));
        }
    });
})(jQuery);
