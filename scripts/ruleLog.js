(function ($) {
    $.widget('pic.ruleLogPanel', {
        options: {
            collapsed: true,
            events: [],
            showDetails: getStorage('picRuleLogShowDetails', 'false') === 'true'
        },
        _create: function () {
            var self = this;
            self.options.collapsed = getStorage('picRuleLogCollapsed', 'true') === 'true';
            self._buildControls();
            if (!self.options.collapsed) self._load();
        },
        _buildControls: function () {
            var self = this, el = self.element;
            el.empty().addClass('picRuleLogEditor').toggleClass('collapsed', self.options.collapsed);
            var title = $('<div class="picCircuitTitle control-panel-title picRuleLogTitle"></div>').appendTo(el);
            $('<span><i class="fas fa-list-alt"></i> Rule Log</span>').appendTo(title);
            $('<button type="button" class="picRuleLogCollapse"></button>')
                .attr('title', self.options.collapsed ? 'Expand Rule Log' : 'Collapse Rule Log')
                .append($('<i></i>').addClass(self.options.collapsed ? 'fas fa-chevron-down' : 'fas fa-chevron-up'))
                .appendTo(title)
                .on('click', function () {
                    self.options.collapsed = !self.options.collapsed;
                    setStorage('picRuleLogCollapsed', self.options.collapsed ? 'true' : 'false');
                    self._buildControls();
                    if (!self.options.collapsed) self._load();
                });
            if (self.options.collapsed) return;

            var content = $('<div class="picRuleLogContent"></div>').appendTo(el);
            var controls = $('<div class="picRuleLogControls"></div>').appendTo(content);
            $('<label class="picRuleLogDetails"><input type="checkbox"> Show action details</label>').appendTo(controls)
                .find('input').prop('checked', self.options.showDetails).on('change', function () {
                    self.options.showDetails = this.checked;
                    setStorage('picRuleLogShowDetails', this.checked ? 'true' : 'false');
                    self._renderEvents();
                });
            $('<button type="button"><i class="fas fa-sync"></i> Refresh</button>').appendTo(controls).on('click', function () { self._load(); });
            $('<div class="picRuleLogStatus"></div>').appendTo(content);
            $('<div class="picRuleLogEvents"></div>').appendTo(content);
            self._renderEvents();
        },
        _load: function () {
            var self = this;
            if (self.options.collapsed) return;
            if (!self._apiReady()) {
                self._status('Waiting for pool controller connection...');
                setTimeout(function () { self._load(); }, 500);
                return;
            }
            self._status('Loading rule log...');
            $.getApiService('/config/rules/log?limit=100', null, function (data) {
                self.options.events = data && Array.isArray(data.events) ? data.events : [];
                self._status(self.options.events.length + ' rule log entries loaded.');
                self._renderEvents();
            }, function () {
                self._status('Unable to load rule log.');
            });
        },
        _renderEvents: function () {
            var self = this;
            var list = self.element.find('div.picRuleLogEvents').empty();
            if (list.length === 0) return;
            var events = self.options.events || [];
            if (events.length === 0) {
                $('<div class="picRuleLogEmpty">No rule actions logged yet.</div>').appendTo(list);
                return;
            }
            events.forEach(function (event) {
                var item = $('<div class="picRuleLogEvent"></div>').appendTo(list);
                var head = $('<div class="picRuleLogEventHead"></div>').appendTo(item);
                $('<span class="picRuleLogTime"></span>').text(self._formatTime(event.ts)).appendTo(head);
                $('<span class="picRuleLogState"></span>').addClass(self._stateClass(event.state))
                    .text(self._stateLabel(event.state)).appendTo(head);
                $('<span class="picRuleLogRule"></span>').text((event.groupName || event.groupId || 'Rule Group') + ' / ' + (event.ruleName || event.ruleId || 'Rule')).appendTo(head);
                $('<span class="picRuleLogReason"></span>').text(event.reason || '').appendTo(head);
                $('<div class="picRuleLogSummary"></div>').text(event.summary || '').appendTo(item);
                if (self.options.showDetails) self._renderDetails(item, event.actions || []);
            });
        },
        _renderDetails: function (item, actions) {
            var details = $('<div class="picRuleLogActionDetails"></div>').appendTo(item);
            if (!actions || actions.length === 0) {
                $('<div class="picRuleLogActionDetail empty">No action details.</div>').appendTo(details);
                return;
            }
            actions.forEach(function (action) {
                var text = action.type || 'action';
                if (action.name || action.id) text += ' ' + (action.name || ('#' + action.id));
                if (typeof action.state !== 'undefined') text += ' ' + (action.state === true ? 'ON' : action.state === false ? 'OFF' : action.state);
                text += ' - ' + (action.status || 'unknown');
                if (action.message) text += ' (' + action.message + ')';
                $('<div class="picRuleLogActionDetail"></div>').text(text).appendTo(details);
            });
        },
        _status: function (text) {
            this.element.find('div.picRuleLogStatus').text(text || '');
        },
        _apiReady: function () {
            return makeBool($('body').attr('data-apiproxy')) || !!$('body').attr('data-apiserviceurl');
        },
        _formatTime: function (ts) {
            return typeof ts === 'number' ? new Date(ts).toLocaleString() : '';
        },
        _stateClass: function (state) {
            if (state === 'then' || state === 'otherwise' || state === 'started' || state === 'stopped') return state;
            return 'other';
        },
        _stateLabel: function (state) {
            if (state === 'then') return 'Then';
            if (state === 'otherwise') return 'Otherwise';
            if (state === 'started') return 'Started';
            if (state === 'stopped') return 'Stopped';
            return state || 'Event';
        }
    });
})(jQuery);
