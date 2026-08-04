(function ($) {
    $.widget('pic.valves', {
        options: {
            showAllValves: false,
            valves: []
        },
        _create: function () {
            var self = this, o = self.options, el = self.element;
            el[0].initValves = function (data) { self._initValves(data); };
            el[0].setValveData = function (data) { self.setValveData(data); };
        },
        _initValves: function (data) {
            var self = this, o = self.options, el = self.element;
            el.empty();
            let div = $('<div class="picCircuitTitle control-panel-title"></div>');
            div.appendTo(el);
            $('<span class="picCircuitTitle">Valves</span>').appendTo(div);
            let showAll = self._showAllValves();
            let toggle = $('<label class="picValveFilter"></label>').appendTo(div);
            $('<input type="checkbox">').prop('checked', showAll).appendTo(toggle).on('change', function () {
                self._showAllValves(makeBool($(this).prop('checked')));
                self._renderValves();
            });
            $('<span></span>').text('Show all').appendTo(toggle);

            o.valves = Array.isArray(data?.valves) ? data.valves : [];
            self._renderValves();
        },
        _renderValves: function () {
            var self = this, o = self.options, el = self.element;
            el.children('div.picValve, div.picValveEmpty').remove();
            let valves = Array.isArray(o.valves) ? o.valves : [];
            valves = valves.filter(v => self._shouldShowValve(v));
            if (valves.length === 0) {
                if (Array.isArray(o.valves) && o.valves.length > 0) $('<div class="picValveEmpty"></div>').text('No configured valves.').appendTo(el);
                else el.hide();
                return;
            }

            el.show();
            for (let i = 0; i < valves.length; i++) {
                $('<div class="picValve"></div>').appendTo(el).valve(valves[i]);
            }
        },
        _showAllValves: function (value) {
            if (typeof value !== 'undefined') {
                setStorage('picValvesShowAll', makeBool(value) ? 'true' : 'false');
                this.options.showAllValves = makeBool(value);
            }
            let saved = getStorage('picValvesShowAll');
            if (typeof saved === 'undefined' || saved === null) return makeBool(this.options.showAllValves);
            return makeBool(saved);
        },
        _isPlaceholderValve: function (valve) {
            return /^Valve\s+[A-Z]$/i.test(String(valve?.name || '').trim());
        },
        _shouldShowValve: function (valve) {
            if (typeof valve === 'undefined' || valve === null) return false;
            if (typeof valve.isActive !== 'undefined' && !makeBool(valve.isActive)) return false;
            return this._showAllValves() || !this._isPlaceholderValve(valve);
        },
        setValveData: function (data) {
            var self = this, o = self.options, el = self.element;
            if (typeof data === 'undefined' || data === null) return;
            let id = parseInt(data.id, 10);
            if (isNaN(id)) return;

            let idx = Array.isArray(o.valves) ? o.valves.findIndex(v => parseInt(v.id, 10) === id) : -1;
            if (idx >= 0) o.valves[idx] = $.extend(true, {}, o.valves[idx], data);
            else {
                if (!Array.isArray(o.valves)) o.valves = [];
                o.valves.push(data);
            }

            let valve = el.find(`div.picValve[data-id=${id}]`);
            if (!self._shouldShowValve(data)) {
                valve.remove();
                if (el.find('div.picValve').length === 0) self._renderValves();
                return;
            }

            if (valve.length === 0) {
                valve = $('<div class="picValve"></div>').appendTo(el);
                valve.valve(data);
            }
            else {
                valve.each(function () { this.setValveData(data); });
            }

            if (el.find('div.picValve').length > 0) el.show();
        }
    });

    $.widget('pic.valve', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].setValveData = function (data) { self.setValveData(data); };
            el[0].equipmentId = function () { return parseInt(el.attr('data-eqid'), 10); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.addClass('picValve');
            if (!el.hasClass('btn')) el.addClass('btn');
            if (!el.hasClass('btn-stateonly')) el.addClass('btn-stateonly');

            $('<span class="picValveTypeIcon"><i class="fas fa-compass"></i></span>').appendTo(el);
            $('<label class="picValveName" data-bind="name"></label>').appendTo(el);
            let status = $('<span class="picValveStatus"></span>').appendTo(el);
            $('<div class="picIndicator picValveIndicator"></div>').appendTo(status);
            $('<i class="fas fa-random picValveStatusIcon"></i>').appendTo(status);
            $('<span class="picValveStatusText"></span>').appendTo(status);

            self.setValveData(o);
        },
        setValveData: function (data) {
            var self = this, o = self.options, el = self.element;
            if (typeof data === 'undefined' || data === null) return;
            if (typeof data.isActive !== 'undefined' && !makeBool(data.isActive)) {
                el.remove();
                return;
            }

            let diverted = makeBool(data.isDiverted);
            el.attr('data-id', data.id);
            el.attr('data-eqid', data.id);
            el.attr('data-diverted', diverted);

            let icon = el.find('span.picValveTypeIcon > i');
            if (makeBool(data.isIntake)) {
                icon.attr('class', 'fas fa-arrow-circle-right');
                icon.css('color', 'red');
            }
            else if (makeBool(data.isReturn)) {
                icon.attr('class', 'fas fa-arrow-circle-left');
                icon.css('color', 'red');
            }
            else if (makeBool(data.isVirtual) || data.master === 1) {
                icon.attr('class', 'far fa-compass');
                icon.css('color', '');
            }
            else {
                icon.attr('class', 'fas fa-compass');
                icon.css('color', '');
            }

            let indicator = el.find('div.picValveIndicator');
            indicator.attr('data-status', diverted ? 'on' : 'off');
            let statusText = el.find('span.picValveStatusText');
            statusText.text(diverted ? 'Diverted' : 'Not Diverted');
            let statusIcon = el.find('i.picValveStatusIcon');
            statusIcon.attr('class', diverted ? 'fas fa-random picValveStatusIcon' : 'fas fa-arrows-alt-h picValveStatusIcon');

            dataBinder.bind(el, data);
        }
    });
})(jQuery);
