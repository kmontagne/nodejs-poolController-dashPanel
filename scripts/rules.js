(function ($) {
    $.widget('pic.rulesPanel', {
        options: {
            rules: { enabled: true, groups: [] },
            circuitRefs: [],
            schedules: [],
            status: null,
            selectedGroupId: null,
            selectedRuleId: null,
            dirty: false
        },
        _create: function () {
            var self = this;
            self.element[0].initRules = function () { self._load(); };
            self._load();
            self.options.statusTimer = setInterval(function () { self._loadStatus(); }, 5000);
        },
        _destroy: function () {
            if (this.options.statusTimer) clearInterval(this.options.statusTimer);
        },
        _load: function () {
            var self = this, o = self.options;
            if (!self._apiReady()) {
                if (o.loadTimer) clearTimeout(o.loadTimer);
                o.loadTimer = setTimeout(function () { self._load(); }, 500);
                return;
            }
            $.when(
                $.getApiService('config/rules', null),
                $.getApiService('config/circuit/references?circuits=true&features=true&groups=false&virtual=false', null),
                $.getApiService('config/options/schedules', null),
                $.getApiService('config/temperatureLabels', null)
            ).done(function (rulesResult, refsResult, scheduleResult, labelsResult) {
                o.rules = self._normalizeRules(rulesResult[0]);
                o.circuitRefs = refsResult[0] || [];
                o.schedules = (scheduleResult[0] && scheduleResult[0].schedules) || [];
                o.temperatureLabels = self._normalizeTemperatureLabels(labelsResult[0]);
                o.dirty = false;
                self._syncSelection();
                self._buildControls();
                self._refreshHeaderStatus();
                self._loadStatus();
            });
        },
        _apiReady: function () {
            return makeBool($('body').attr('data-apiproxy')) || !!$('body').attr('data-apiserviceurl');
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.empty().addClass('picRulesEditor').toggleClass('dirty', o.dirty === true);
            el.toggleClass('collapsed', self._isCollapsed());
            var title = $('<div class="picCircuitTitle control-panel-title picRulesTitle"></div>').appendTo(el);
            $('<span><i class="fas fa-bolt"></i> Automations</span>').appendTo(title);
            $('<span class="picRulesDirtyPill">Unsaved</span>').appendTo(title).toggle(o.dirty === true);
            $('<button type="button" class="picRulesCollapse"></button>')
                .attr('title', self._isCollapsed() ? 'Expand Automations' : 'Collapse Automations')
                .append($('<i></i>').addClass(self._isCollapsed() ? 'fas fa-chevron-down' : 'fas fa-chevron-up'))
                .appendTo(title)
                .on('click', function () {
                    self._setCollapsed(!self._isCollapsed());
                    self._buildControls();
                });
            var content = $('<div class="picRulesContent"></div>').appendTo(el);
            if (self._isCollapsed()) {
                self._refreshHeaderStatus();
                return;
            }
            var top = $('<div class="picRulesTop"></div>').appendTo(content);
            $('<label><input type="checkbox" class="ruleEngineEnabled"> Enable rules engine</label>').appendTo(top)
                .find('input').prop('checked', o.rules.enabled !== false).on('change', function () {
                    o.rules.enabled = this.checked;
                    self._markDirty();
                    self._renderStatus();
                });
            $('<label><input type="checkbox" class="picRuleShowSolar"> Show solar source</label>').appendTo(top)
                .find('input').prop('checked', self._solarTempConfig().show).on('change', function () {
                    o.temperatureLabels = o.temperatureLabels || self._normalizeTemperatureLabels();
                    o.temperatureLabels.solar.show = this.checked;
                    self._markDirty();
                    self._buildControls();
                });
            self._field(top, 'Solar label', $('<input type="text" maxlength="24" class="picRuleSolarLabel">').val(self._solarTempConfig().label).on('change keyup', function () {
                o.temperatureLabels = o.temperatureLabels || self._normalizeTemperatureLabels();
                o.temperatureLabels.solar.label = this.value || 'Solar';
                self._markDirty();
            }));
            $('<button type="button" class="picRulesSave"><i class="fas fa-save"></i> Save</button>').prop('disabled', o.dirty !== true).appendTo(top).on('click', function () { self._save(); });
            $('<button type="button" class="picRulesCancel"><i class="fas fa-undo"></i> Cancel</button>').prop('disabled', o.dirty !== true).appendTo(top).on('click', function () { self._cancel(); });
            $('<button type="button"><i class="fas fa-code"></i></button>').attr('title', 'Advanced JSON').appendTo(top).on('click', function () {
                self._showJsonEditor();
            });
            $('<div class="picRulesHint">Rules are saved to nodejs-poolController config under web.rules. Use If conditions and Then actions to describe automation logic.</div>').appendTo(content);
            $('<div class="picRulesDirtyNotice">Unsaved changes</div>').appendTo(content).toggle(o.dirty === true);
            $('<div class="picRulesStatus"></div>').appendTo(content);
            self._renderStatus();

            var shell = $('<div class="picRulesShell"></div>').appendTo(content);
            self._buildGroupList(shell);
            self._buildEditor(shell);
        },
        _renderStatus: function () {
            var msg = this.element.find('div.picRulesStatus');
            if (this.options.rules.enabled === false) msg.text('Rules engine is off - rules are not evaluated until you enable it. You can still edit and save rules here.').show();
            else msg.hide();
        },
        _buildGroupList: function (parent) {
            var self = this, o = self.options;
            var list = $('<div class="picRuleGroups"></div>').appendTo(parent);
            var head = $('<div class="picRuleSideHead"><span>Rule groups</span></div>').appendTo(list);
            $('<button type="button"><i class="fas fa-plus"></i> New Group</button>').appendTo(head).on('click', function () {
                var group = self._newGroup();
                o.rules.groups.push(group);
                o.selectedGroupId = group.id;
                o.selectedRuleId = null;
                self._markDirty();
                self._buildControls();
            });
            for (var i = 0; i < o.rules.groups.length; i++) {
                (function (group) {
                    var row = $('<div class="picRuleGroupItem"></div>').toggleClass('selected', group.id === o.selectedGroupId).appendTo(list);
                    $('<input type="checkbox">').attr('title', 'Enable rule group').prop('checked', group.enabled !== false).appendTo(row).on('click', function (evt) {
                        evt.stopPropagation();
                    }).on('change', function () {
                        group.enabled = this.checked;
                        self._markDirty();
                    });
                    $('<span></span>').text(group.name || group.id).appendTo(row).on('click', function () {
                        o.selectedGroupId = group.id;
                        o.selectedRuleId = (group.rules[0] && group.rules[0].id) || null;
                        self._buildControls();
                    });
                    $('<button type="button"><i class="fas fa-trash"></i></button>').attr('title', 'Remove group').appendTo(row).on('click', function () {
                        o.rules.groups = o.rules.groups.filter(function (g) { return g.id !== group.id; });
                        o.selectedGroupId = o.rules.groups[0] ? o.rules.groups[0].id : null;
                        o.selectedRuleId = o.rules.groups[0] && o.rules.groups[0].rules[0] ? o.rules.groups[0].rules[0].id : null;
                        self._markDirty();
                        self._buildControls();
                    });
                })(o.rules.groups[i]);
            }
        },
        _buildEditor: function (parent) {
            var self = this, group = self._selectedGroup();
            var editor = $('<div class="picRuleEditor"></div>').appendTo(parent);
            if (!group) {
                $('<div class="picRuleEmpty">No rule groups configured.</div>').appendTo(editor);
                return;
            }
            self._field(editor, 'Group name', $('<input type="text">').val(group.name || '').on('change keyup', function () {
                group.name = this.value;
                self._markDirty();
                self._syncSelectedGroupLabel();
            }));
            $('<label class="picRuleCheck"><input type="checkbox"> Group enabled</label>').appendTo(editor)
                .find('input').prop('checked', group.enabled !== false).on('change', function () { group.enabled = this.checked; self._markDirty(); });
            self._buildActiveWindow(editor, group);

            var rulesHead = $('<div class="picRuleSectionHead"><span>Rules</span></div>').appendTo(editor);
            $('<button type="button"><i class="fas fa-plus"></i> Rule</button>').appendTo(rulesHead).on('click', function () {
                var rule = self._newRule();
                group.rules.push(rule);
                self.options.selectedRuleId = rule.id;
                self._markDirty();
                self._buildControls();
            });
            var tabs = $('<div class="picRuleTabs"></div>').appendTo(editor);
            for (var i = 0; i < group.rules.length; i++) self._buildRuleTab(tabs, group, group.rules[i]);
            var rule = self._selectedRule(group);
            if (rule) self._buildRuleEditor(editor, group, rule);
            else $('<div class="picRuleEmpty">No rules in this group. Add a rule to begin defining conditions and actions.</div>').appendTo(editor);
            self._applyStatus();
        },
        _buildRuleTab: function (tabs, group, rule) {
            var self = this;
            var tab = $('<button type="button" class="picRuleTab"></button>').toggleClass('selected', rule.id === self.options.selectedRuleId).appendTo(tabs);
            $('<span></span>').text(rule.name || rule.id).appendTo(tab);
            $('<i class="fas fa-times"></i>').attr('title', 'Remove rule').appendTo(tab).on('click', function (evt) {
                evt.stopPropagation();
                group.rules = group.rules.filter(function (r) { return r.id !== rule.id; });
                self.options.selectedRuleId = group.rules[0] ? group.rules[0].id : null;
                self._markDirty();
                self._buildControls();
            });
            tab.on('click', function () {
                self.options.selectedRuleId = rule.id;
                self._buildControls();
            });
        },
        _buildRuleEditor: function (editor, group, rule) {
            var self = this;
            self._field(editor, 'Rule name', $('<input type="text" class="picRuleNameInput">').val(rule.name || '').on('change keyup', function () {
                rule.name = this.value;
                self._markDirty();
                editor.find('button.picRuleTab.selected span').text(rule.name || rule.id);
            }));
            $('<label class="picRuleCheck"><input type="checkbox"> Rule enabled</label>').appendTo(editor)
                .find('input').prop('checked', rule.enabled !== false).on('change', function () { rule.enabled = this.checked; self._markDirty(); });
            self._field(editor, 'Match', self._select([{ v: 'all', t: 'All conditions' }, { v: 'any', t: 'Any condition' }], rule.match || 'all').on('change', function () { rule.match = this.value; self._markDirty(); }));
            $('<div class="picRuleEvalStatus"></div>').appendTo(editor);

            self._section(editor, 'When (conditions)', 'Conditions are evaluated when temperatures or circuits change.');
            self._buildConditions(editor, group, rule);
            self._section(editor, 'Then (actions)', '');
            self._buildActions(editor, rule, 'actions');
            self._section(editor, 'Otherwise (actions)', 'Runs when the conditions remain false through the hysteresis duration, if enabled.');
            self._buildActions(editor, rule, 'otherwiseActions');
            self._buildHysteresis(editor, rule);
        },
        _buildActiveWindow: function (editor, group) {
            var self = this;
            group.activeWindow = group.activeWindow || { enabled: false };
            var win = group.activeWindow;
            $('<div class="picRuleSubhead">Active Window</div>').appendTo(editor);
            $('<div class="picRuleHelp">When inactive, this group does not evaluate rules or run Otherwise actions. Empty fields mean unrestricted.</div>').appendTo(editor);
            var box = $('<div class="picRuleActiveWindow"></div>').appendTo(editor);
            $('<label class="picRuleCheck"><input type="checkbox"> Use active window</label>').appendTo(box)
                .find('input').prop('checked', win.enabled === true).on('change', function () { win.enabled = this.checked; self._markDirty(); });
            var fields = $('<div class="picRuleWindowFields"></div>').appendTo(box);
            self._field(fields, 'Start date', $('<input type="text" placeholder="MM-DD">').val(win.startDate || '').on('change keyup', function () { win.startDate = this.value; self._markDirty(); }));
            self._field(fields, 'End date', $('<input type="text" placeholder="MM-DD">').val(win.endDate || '').on('change keyup', function () { win.endDate = this.value; self._markDirty(); }));
            self._field(fields, 'Start time', $('<input type="time">').val(win.startTime || '').on('change keyup', function () { win.startTime = this.value; self._markDirty(); }));
            self._field(fields, 'End time', $('<input type="time">').val(win.endTime || '').on('change keyup', function () { win.endTime = this.value; self._markDirty(); }));
            var days = $('<div class="picRuleDays"></div>').appendTo(box);
            $('<span>Days</span>').appendTo(days);
            var selected = Array.isArray(win.days) ? win.days : [];
            var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            for (var i = 0; i < dayNames.length; i++) {
                (function (day) {
                    $('<label><input type="checkbox"> ' + dayNames[day] + '</label>').appendTo(days)
                        .find('input').prop('checked', selected.indexOf(day) >= 0).on('change', function () {
                            win.days = Array.isArray(win.days) ? win.days : [];
                            if (this.checked && win.days.indexOf(day) < 0) win.days.push(day);
                            if (!this.checked) win.days = win.days.filter(function (d) { return d !== day; });
                            win.days.sort();
                            self._markDirty();
                        });
                })(i);
            }
        },
        _buildConditions: function (editor, group, rule) {
            var self = this, list = $('<div class="picRuleBlocks"></div>').appendTo(editor);
            rule.conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
            for (var i = 0; i < rule.conditions.length; i++) self._buildCondition(list, group, rule, rule.conditions[i], i);
            $('<button type="button"><i class="fas fa-plus"></i> Condition</button>').appendTo(editor).on('click', function () {
                rule.conditions.push(self._newCondition('temp'));
                self._markDirty();
                self._buildControls();
            });
        },
        _buildCondition: function (list, group, rule, condition, index) {
            var self = this, box = $('<div class="picRuleBlock"></div>').appendTo(list);
            box.attr('data-condition-index', index);
            $('<div class="picConditionStatus unknown">?</div>').attr('title', 'Condition has not been evaluated yet').appendTo(box);
            var type = self._conditionType(condition);
            self._field(box, 'Type', self._select([
                { v: 'temp', t: 'Temp' },
                { v: 'tempDelta', t: 'Temp difference' },
                { v: 'circuitState', t: 'Circuit state' },
                { v: 'featureState', t: 'Feature state' },
                { v: 'runtime', t: 'Runtime' },
                { v: 'ruleStable', t: 'Rule stable time' },
                { v: 'bodyHeater', t: 'Body heater' },
                { v: 'stateValue', t: 'State value' }
            ], type).on('change', function () {
                rule.conditions[index] = self._newCondition(this.value);
                self._markDirty();
                self._buildControls();
            }));
            if (type === 'temp') self._conditionTemp(box, condition);
            else if (type === 'tempDelta') self._conditionTempDelta(box, condition);
            else if (type === 'circuitState') self._conditionCircuitState(box, condition);
            else if (type === 'featureState') self._conditionFeatureState(box, condition);
            else if (type === 'runtime') self._conditionRuntime(box, condition);
            else if (type === 'ruleStable') self._conditionRuleStable(box, condition);
            else if (type === 'bodyHeater') self._conditionBodyHeater(box, condition);
            else self._conditionStateValue(box, condition);
            self._removeButton(box, function () {
                rule.conditions.splice(index, 1);
                self._markDirty();
                self._buildControls();
            });
        },
        _conditionTemp: function (box, condition) {
            var self = this;
            self._field(box, 'Source', self._tempSourceSelect(condition.left || 'poolTemp', true).on('change', function () { condition.left = this.value; self._markDirty(); }));
            self._field(box, 'Operator', self._operatorSelect(condition.operator || '>').on('change', function () { condition.operator = this.value; self._markDirty(); }));
            self._field(box, 'Value', $('<input type="text">').val(self._valueText(condition.right)).on('change keyup', function () { condition.right = self._parseInput(this.value); self._markDirty(); }));
        },
        _conditionTempDelta: function (box, condition) {
            var self = this, parsed = self._parseTempDelta(condition.left);
            self._field(box, 'Higher temp', self._tempSourceSelect(parsed.left, false).on('change', function () {
                parsed.left = this.value;
                condition.left = self._tempDeltaValue(parsed.left, parsed.right);
                self._markDirty();
            }));
            self._field(box, 'Lower temp', self._tempSourceSelect(parsed.right, false).on('change', function () {
                parsed.right = this.value;
                condition.left = self._tempDeltaValue(parsed.left, parsed.right);
                self._markDirty();
            }));
            self._field(box, 'Operator', self._operatorSelect(condition.operator || '>=').on('change', function () { condition.operator = this.value; self._markDirty(); }));
            self._field(box, 'Degrees', $('<input type="text">').val(self._valueText(condition.right)).on('change keyup', function () { condition.right = self._parseInput(this.value); self._markDirty(); }));
            $('<div class="picRuleHelp">Compares Higher temp minus Lower temp. For cooling sources, use Pool temp minus ' + self._solarTempConfig().label + ' temp &gt;= the minimum useful cooling difference.</div>').appendTo(box);
        },
        _conditionCircuitState: function (box, condition) {
            var self = this, parsed = self._parseStatePath(condition.left, 'circuit');
            self._field(box, 'Circuit', self._refSelect(parsed.kind, parsed.id).on('change', function () {
                var opt = $(this).find('option:selected');
                condition.left = opt.attr('data-kind') + ':' + this.value + ':isOn';
                self._markDirty();
            }));
            self._field(box, 'State', self._select([{ v: 'isTrue', t: 'On' }, { v: 'isFalse', t: 'Off' }], condition.operator || 'isTrue').on('change', function () { condition.operator = this.value; self._markDirty(); }));
        },
        _conditionFeatureState: function (box, condition) {
            var self = this, parsed = self._parseStatePath(condition.left, 'feature');
            self._field(box, 'Feature', self._refSelect('feature', parsed.id).on('change', function () {
                condition.left = 'feature:' + this.value + ':isOn';
                self._markDirty();
            }));
            self._field(box, 'State', self._select([{ v: 'isTrue', t: 'On' }, { v: 'isFalse', t: 'Off' }], condition.operator || 'isTrue').on('change', function () { condition.operator = this.value; self._markDirty(); }));
        },
        _conditionRuntime: function (box, condition) {
            var self = this, parsed = self._parseRuntimePath(condition.left);
            self._field(box, 'Equipment', self._select([{ v: 'circuit', t: 'Circuit' }, { v: 'feature', t: 'Feature' }], parsed.kind).on('change', function () {
                parsed.kind = this.value;
                parsed.id = self._firstRefId(parsed.kind);
                condition.left = self._runtimeValue(parsed.kind, parsed.id, parsed.metric);
                self._markDirty();
                self._buildControls();
            }));
            self._field(box, parsed.kind === 'feature' ? 'Feature' : 'Circuit', self._refSelect(parsed.kind, parsed.id).on('change', function () {
                parsed.id = parseInt(this.value, 10);
                condition.left = self._runtimeValue(parsed.kind, parsed.id, parsed.metric);
                self._markDirty();
            }));
            self._field(box, 'Unit', self._select([
                { v: 'runtimeMinutes', t: 'Minutes' },
                { v: 'runtimeSeconds', t: 'Seconds' }
            ], parsed.metric).on('change', function () {
                parsed.metric = this.value;
                condition.left = self._runtimeValue(parsed.kind, parsed.id, parsed.metric);
                self._markDirty();
            }));
            self._field(box, 'Operator', self._operatorSelect(condition.operator || '>=').on('change', function () { condition.operator = this.value; self._markDirty(); }));
            self._field(box, 'Value', $('<input type="text">').val(self._valueText(condition.right)).on('change keyup', function () { condition.right = self._parseInput(this.value); self._markDirty(); }));
            $('<div class="picRuleHelp">Runtime is 0 while the equipment is off. Use it to let equipment stabilize before evaluating performance conditions.</div>').appendTo(box);
        },
        _conditionRuleStable: function (box, condition) {
            var self = this, metric = String(condition.left || '') === 'rule:stableSeconds' ? 'stableSeconds' : 'stableMinutes';
            self._field(box, 'Unit', self._select([
                { v: 'stableMinutes', t: 'Minutes' },
                { v: 'stableSeconds', t: 'Seconds' }
            ], metric).on('change', function () {
                condition.left = 'rule:' + this.value;
                self._markDirty();
            }));
            self._field(box, 'Operator', self._operatorSelect(condition.operator || '>=').on('change', function () { condition.operator = this.value; self._markDirty(); }));
            self._field(box, 'Value', $('<input type="text">').val(self._valueText(condition.right)).on('change keyup', function () { condition.right = self._parseInput(this.value); self._markDirty(); }));
            $('<div class="picRuleHelp">Stable time measures how long this rule has continuously stayed true or false.</div>').appendTo(box);
        },
        _conditionBodyHeater: function (box, condition) {
            var self = this, body = String(condition.left || '').indexOf('pool') === 0 ? 'pool' : 'spa';
            var mode = String(condition.left || '').indexOf('HeatModeOn') > -1 ? 'mode' : 'active';
            var on = condition.operator !== 'isFalse';
            self._field(box, 'Body', self._select([{ v: 'spa', t: 'Spa' }, { v: 'pool', t: 'Pool' }], body).on('change', function () {
                condition.left = self._heaterValue(this.value, mode);
                self._markDirty();
            }));
            self._field(box, 'Heater', self._select([
                { v: 'active:true', t: 'Heating' },
                { v: 'active:false', t: 'Not heating' },
                { v: 'mode:true', t: 'Mode on' },
                { v: 'mode:false', t: 'Mode off' }
            ], mode + ':' + on).on('change', function () {
                var parts = this.value.split(':');
                var bodyVal = box.find('select').eq(1).val();
                condition.left = self._heaterValue(bodyVal, parts[0]);
                condition.operator = parts[1] === 'true' ? 'isTrue' : 'isFalse';
                self._markDirty();
            }));
        },
        _conditionStateValue: function (box, condition) {
            var self = this;
            self._field(box, 'State path', $('<input type="text">').val(condition.left || '').on('change keyup', function () { condition.left = this.value; self._markDirty(); }));
            self._field(box, 'Operator', self._operatorSelect(condition.operator || '===').on('change', function () { condition.operator = this.value; self._markDirty(); }));
            self._field(box, 'Value', $('<input type="text">').val(self._valueText(condition.right)).on('change keyup', function () { condition.right = self._parseInput(this.value); self._markDirty(); }));
        },
        _buildActions: function (editor, rule, prop) {
            var self = this, list = $('<div class="picRuleBlocks"></div>').appendTo(editor);
            rule[prop] = Array.isArray(rule[prop]) ? rule[prop] : [];
            for (var i = 0; i < rule[prop].length; i++) self._buildAction(list, rule, prop, rule[prop][i], i);
            $('<button type="button"><i class="fas fa-plus"></i> ' + (prop === 'actions' ? 'Action' : 'Otherwise Action') + '</button>').appendTo(editor).on('click', function () {
                rule[prop].push(self._newAction('setCircuit'));
                self._markDirty();
                self._buildControls();
            });
        },
        _buildAction: function (list, rule, prop, action, index) {
            var self = this, box = $('<div class="picRuleBlock"></div>').appendTo(list);
            self._field(box, 'Type', self._select([
                { v: 'setCircuit', t: 'Circuit' },
                { v: 'setFeature', t: 'Circuit feature' },
                { v: 'circuitLock', t: 'Circuit lock' },
                { v: 'featureLock', t: 'Feature lock' },
                { v: 'setScheduleDisabled', t: 'Schedule' },
                { v: 'log', t: 'Log' }
            ], action.type || 'setCircuit').on('change', function () {
                rule[prop][index] = self._newAction(this.value);
                self._markDirty();
                self._buildControls();
            }));
            if (action.type === 'log') {
                self._field(box, 'Message', $('<input type="text">').val(action.message || '').on('change keyup', function () { action.message = this.value; self._markDirty(); }));
            }
            else if (action.type === 'setScheduleDisabled') {
                self._field(box, 'Schedule', self._scheduleSelect(action.id || (action.ids && action.ids[0])).on('change', function () { action.id = parseInt(this.value, 10); delete action.ids; self._markDirty(); }));
                self._field(box, 'Command', self._select([{ v: 'true', t: 'Disable' }, { v: 'false', t: 'Enable' }], String(action.state !== false)).on('change', function () { action.state = this.value === 'true'; self._markDirty(); }));
            }
            else {
                var kind = action.type === 'setFeature' || action.type === 'featureLock' ? 'feature' : 'circuit';
                self._field(box, kind === 'feature' ? 'Feature' : 'Circuit', self._refSelect(kind, action.id).on('change', function () { action.id = parseInt(this.value, 10); self._markDirty(); }));
                var labels = action.type === 'circuitLock' || action.type === 'featureLock' ? [{ v: 'true', t: 'Disable (lock)' }, { v: 'false', t: 'Enable (unlock)' }] : [{ v: 'true', t: 'On' }, { v: 'false', t: 'Off' }];
                self._field(box, 'Command', self._select(labels, String(action.state !== false)).on('change', function () { action.state = this.value === 'true'; self._markDirty(); }));
                if (action.type === 'circuitLock' || action.type === 'featureLock') $('<div class="picRuleHelp">Lock actions are saved, but backend execution logs a warning until a persistent lock API is wired.</div>').appendTo(box);
            }
            self._field(box, 'Delay (sec)', $('<input type="number" min="0">').val(action.delaySeconds || 0).on('change keyup', function () { action.delaySeconds = parseInt(this.value, 10) || 0; self._markDirty(); }));
            self._removeButton(box, function () {
                rule[prop].splice(index, 1);
                self._markDirty();
                self._buildControls();
            });
        },
        _buildHysteresis: function (editor, rule) {
            var self = this;
            rule.hysteresis = rule.hysteresis || { enabled: false, durationSeconds: 0, resetOnFalse: true };
            $('<div class="picRuleSubhead">Hysteresis</div>').appendTo(editor);
            $('<div class="picRuleHelp">When enabled, the condition must remain true or false for the duration before Then or Otherwise actions run. A transient flip cancels the pending transition.</div>').appendTo(editor);
            var row = $('<div class="picRuleHysteresis"></div>').appendTo(editor);
            $('<label><input type="checkbox"> Enabled</label>').appendTo(row).find('input').prop('checked', rule.hysteresis.enabled === true).on('change', function () { rule.hysteresis.enabled = this.checked; self._markDirty(); });
            self._field(row, 'Duration (sec)', $('<input type="number" min="0">').val(rule.hysteresis.durationSeconds || 0).on('change keyup', function () { rule.hysteresis.durationSeconds = parseInt(this.value, 10) || 0; self._markDirty(); }));
        },
        _loadStatus: function () {
            var self = this;
            if (!self._apiReady()) return;
            $.getApiService('config/rules/status', null, function (status) {
                self.options.status = status;
                self._applyStatus();
            });
        },
        _applyStatus: function () {
            var self = this, group = self._selectedGroup(), rule = group ? self._selectedRule(group) : null;
            if (!group || !rule || !self.options.status) return;
            var ruleStatus = self._ruleStatus(group.id, rule.id);
            if (!ruleStatus) return;
            var groupStatus = self._groupStatus(group.id);
            self.element.find('div.picRuleEvalStatus')
                .removeClass('matched notmatched pending inactive')
                .addClass(ruleStatus.active ? ruleStatus.pending ? 'pending' : ruleStatus.matched ? 'matched' : 'notmatched' : 'inactive')
                .text(self._ruleStatusText(ruleStatus, groupStatus, rule))
                .toggle(true);
            for (var i = 0; i < ruleStatus.conditions.length; i++) {
                var condition = ruleStatus.conditions[i];
                var badge = self.element.find('div.picRuleBlock[data-condition-index=' + condition.index + '] > div.picConditionStatus');
                badge.removeClass('true false unknown')
                    .addClass(condition.matched ? 'true' : 'false')
                    .text(condition.matched ? 'TRUE' : 'FALSE')
                    .attr('title', self._conditionStatusTitle(condition));
            }
        },
        _ruleStatus: function (groupId, ruleId) {
            var status = this.options.status;
            if (!status || !Array.isArray(status.groups)) return null;
            for (var i = 0; i < status.groups.length; i++) {
                if (status.groups[i].id !== groupId) continue;
                var rules = status.groups[i].rules || [];
                for (var j = 0; j < rules.length; j++) {
                    if (rules[j].id === ruleId) return rules[j];
                }
            }
            return null;
        },
        _groupStatus: function (groupId) {
            var status = this.options.status;
            if (!status || !Array.isArray(status.groups)) return null;
            for (var i = 0; i < status.groups.length; i++) {
                if (status.groups[i].id === groupId) return status.groups[i];
            }
            return null;
        },
        _ruleStatusText: function (ruleStatus, groupStatus, rule) {
            if (!ruleStatus.active) {
                var reason = (groupStatus && groupStatus.inactiveReason) || ruleStatus.inactiveReason;
                if (reason === 'outsideDateRange') return 'Rule group is outside its active date range.';
                if (reason === 'outsideDayOfWeek') return 'Rule group is outside its active days.';
                if (reason === 'outsideTimeWindow') return 'Rule group is outside its active time window.';
                if (reason === 'disabled') return 'Rule group is disabled.';
                return 'Rule is not active.';
            }
            if (ruleStatus.pending) {
                return 'Hysteresis pending: waiting ' + ruleStatus.pending.remainingSeconds + ' sec before ' + (ruleStatus.pending.targetState ? 'Then' : 'Otherwise') + ' actions run.';
            }
            if (ruleStatus.matched) return 'Rule conditions are currently true; Then actions are allowed to run.';
            var reasonText = this._firstUnmatchedConditionText(ruleStatus, rule);
            return reasonText ? 'Rule is not true: ' + reasonText + '.' : 'Rule conditions are currently false; Then actions will not run.';
        },
        _firstUnmatchedConditionText: function (ruleStatus, rule) {
            if (!ruleStatus || !rule || !Array.isArray(ruleStatus.conditions)) return '';
            var sourceConditions = rule.conditions || [];
            for (var i = 0; i < ruleStatus.conditions.length; i++) {
                if (ruleStatus.conditions[i].matched) continue;
                return this._conditionReasonText(sourceConditions[ruleStatus.conditions[i].index], ruleStatus.conditions[i]);
            }
            return '';
        },
        _conditionReasonText: function (condition, status) {
            var left = condition && condition.left;
            var actual = status ? status.left : undefined;
            if (left === 'poolTemp') return 'pool temp is ' + this._formatStatusValue(actual) + 'F';
            if (left === 'spaTemp') return 'spa temp is ' + this._formatStatusValue(actual) + 'F';
            if (left === 'airTemp') return 'air temp is ' + this._formatStatusValue(actual) + 'F';
            if (left === 'dewPoint') return 'dew point is ' + this._formatStatusValue(actual) + 'F';
            if (left === 'poolSolarDelta') return 'Pool - ' + this._solarTempConfig().label + ' delta is ' + this._formatStatusValue(actual) + 'F';
            if (left === 'rule:stableMinutes') return 'stable time is ' + this._formatStatusValue(actual) + ' minutes';
            if (left === 'rule:stableSeconds') return 'stable time is ' + this._formatStatusValue(actual) + ' seconds';
            if (typeof left === 'string' && left.indexOf('circuit:') === 0) return this._equipmentConditionReason(left, actual, 'circuit');
            if (typeof left === 'string' && left.indexOf('feature:') === 0) return this._equipmentConditionReason(left, actual, 'feature');
            return String(left || 'condition') + ' evaluated to ' + this._formatStatusValue(actual);
        },
        _equipmentConditionReason: function (left, actual, fallbackKind) {
            var parsed = this._parseStatePath(left, fallbackKind);
            var ref = this._refByKindAndId(parsed.kind, parsed.id);
            var name = ref && ref.name ? ref.name : (parsed.kind === 'feature' ? 'Feature ' : 'Circuit ') + parsed.id;
            if (left.indexOf(':runtimeMinutes') > -1) return name + ' runtime is ' + this._formatStatusValue(actual) + ' minutes';
            if (left.indexOf(':runtimeSeconds') > -1) return name + ' runtime is ' + this._formatStatusValue(actual) + ' seconds';
            return name + ' is ' + (actual === true ? 'on' : actual === false ? 'off' : this._formatStatusValue(actual));
        },
        _formatStatusValue: function (value) {
            if (typeof value === 'number') return Math.round(value * 10) / 10;
            if (typeof value === 'undefined') return 'unavailable';
            if (value === null) return 'unavailable';
            return String(value);
        },
        _conditionStatusTitle: function (condition) {
            var left = typeof condition.left === 'undefined' ? 'undefined' : condition.left;
            var right = typeof condition.right === 'undefined' ? '' : ' ' + condition.operator + ' ' + condition.right;
            return 'Evaluated: ' + left + right;
        },
        _field: function (parent, label, input) {
            var row = $('<label class="picRuleField"></label>').appendTo(parent);
            $('<span></span>').text(label).appendTo(row);
            input.appendTo(row);
            return row;
        },
        _section: function (parent, title, hint) {
            $('<div class="picRuleSubhead"></div>').text(title).appendTo(parent);
            if (hint) $('<div class="picRuleHelp"></div>').text(hint).appendTo(parent);
        },
        _removeButton: function (parent, click) {
            $('<button type="button" class="picRuleRemove"><i class="fas fa-trash"></i></button>').attr('title', 'Remove').appendTo(parent).on('click', click);
        },
        _select: function (items, value) {
            var sel = $('<select></select>');
            for (var i = 0; i < items.length; i++) $('<option></option>').val(items[i].v).text(items[i].t).appendTo(sel);
            sel.val(String(value));
            return sel;
        },
        _operatorSelect: function (value) {
            return this._select([
                { v: '>', t: '>' }, { v: '>=', t: '>=' }, { v: '<', t: '<' }, { v: '<=', t: '<=' },
                { v: '===', t: 'Equals' }, { v: '!==', t: 'Not equals' }
            ], value);
        },
        _tempSourceSelect: function (value, includeLegacyDeltas) {
            var items = [
                { v: 'poolTemp', t: 'Pool temp' },
                { v: 'spaTemp', t: 'Spa temp' },
                { v: 'airTemp', t: 'Air temp' },
                { v: 'dewPoint', t: 'Dew point' },
                { v: 'bodyTemp', t: 'Selected body temp' }
            ];
            var solar = this._solarTempConfig();
            if (solar.show) items.splice(2, 0, { v: 'solarTemp', t: solar.label + ' temp' });
            if (includeLegacyDeltas === true) {
                if (solar.show) {
                    items.push({ v: 'poolSolarDelta', t: 'Pool - ' + solar.label + ' delta' });
                    items.push({ v: 'spaSolarDelta', t: 'Spa - ' + solar.label + ' delta' });
                    items.push({ v: 'bodySolarDelta', t: 'Selected body - ' + solar.label + ' delta' });
                }
            }
            return this._select(items, value);
        },
        _solarTempConfig: function () {
            var labels = this.options.temperatureLabels || {};
            var solar = labels.solar || {};
            return { show: solar.show !== false, label: solar.label || 'Solar' };
        },
        _normalizeTemperatureLabels: function (labels) {
            labels = labels || {};
            var solar = labels.solar || {};
            return { solar: { show: solar.show !== false, label: solar.label || 'Solar' } };
        },
        _refSelect: function (kind, value) {
            var sel = $('<select></select>');
            var refs = this.options.circuitRefs.filter(function (r) { return r.equipmentType === kind; });
            for (var i = 0; i < refs.length; i++) $('<option></option>').val(refs[i].id).attr('data-kind', kind).text(refs[i].name || (kind + ' ' + refs[i].id)).appendTo(sel);
            if (refs.length === 0) $('<option></option>').val('').text('No ' + kind + 's found').appendTo(sel);
            if (value) sel.val(String(value));
            return sel;
        },
        _scheduleSelect: function (value) {
            var sel = $('<select></select>');
            for (var i = 0; i < this.options.schedules.length; i++) {
                var sched = this.options.schedules[i], ref = this._refById(sched.circuit);
                $('<option></option>').val(sched.id).text((ref && ref.name ? ref.name : 'Schedule ' + sched.id) + ' #' + sched.id).appendTo(sel);
            }
            if (this.options.schedules.length === 0) $('<option></option>').val('').text('No schedules found').appendTo(sel);
            if (value) sel.val(String(value));
            return sel;
        },
        _markDirty: function () {
            this.options.dirty = true;
            this._setDirtyState(true);
        },
        _setDirtyState: function (dirty) {
            this.options.dirty = dirty === true;
            this.element.toggleClass('dirty', this.options.dirty);
            this.element.find('button.picRulesSave').toggleClass('dirty', this.options.dirty).prop('disabled', !this.options.dirty);
            this.element.find('button.picRulesCancel').prop('disabled', !this.options.dirty);
            this.element.find('div.picRulesDirtyNotice').toggle(this.options.dirty);
            this.element.find('span.picRulesDirtyPill').toggle(this.options.dirty);
        },
        _cancel: function () {
            if (this.options.dirty !== true) return;
            this._load();
        },
        _refreshHeaderStatus: function () {
            $('div.picController').each(function () {
                if (this.refreshRulesEngineStatus) this.refreshRulesEngineStatus();
            });
        },
        _syncSelectedGroupLabel: function () {
            var group = this._selectedGroup();
            this.element.find('div.picRuleGroupItem.selected span').text(group ? group.name : '');
        },
        _syncSelection: function () {
            var o = this.options;
            var group = (o.rules.groups || []).find(function (g) { return g.id === o.selectedGroupId; });
            if (!group) {
                group = o.rules.groups[0];
                o.selectedGroupId = group ? group.id : null;
            }
            if (!group) {
                o.selectedRuleId = null;
                return;
            }
            var rule = (group.rules || []).find(function (r) { return r.id === o.selectedRuleId; });
            o.selectedRuleId = rule ? rule.id : group.rules[0] ? group.rules[0].id : null;
        },
        _selectedGroup: function () {
            var o = this.options;
            return (o.rules.groups || []).find(function (g) { return g.id === o.selectedGroupId; }) || o.rules.groups[0];
        },
        _selectedRule: function (group) {
            var o = this.options;
            if (!group) return null;
            return (group.rules || []).find(function (r) { return r.id === o.selectedRuleId; }) || group.rules[0];
        },
        _normalizeRules: function (rules) {
            rules = rules || { enabled: true, groups: [] };
            rules.groups = Array.isArray(rules.groups) ? rules.groups : [];
            for (var i = 0; i < rules.groups.length; i++) {
                rules.groups[i].match = rules.groups[i].match || 'all';
                rules.groups[i].activeWindow = rules.groups[i].activeWindow || { enabled: false };
                rules.groups[i].activeWindow.days = Array.isArray(rules.groups[i].activeWindow.days) ? rules.groups[i].activeWindow.days : [];
                rules.groups[i].rules = Array.isArray(rules.groups[i].rules) ? rules.groups[i].rules : [];
                for (var j = 0; j < rules.groups[i].rules.length; j++) {
                    rules.groups[i].rules[j].match = rules.groups[i].rules[j].match || rules.groups[i].match || 'all';
                    rules.groups[i].rules[j].otherwiseActions = Array.isArray(rules.groups[i].rules[j].otherwiseActions) ? rules.groups[i].rules[j].otherwiseActions : [];
                    rules.groups[i].rules[j].hysteresis = rules.groups[i].rules[j].hysteresis || { enabled: false, durationSeconds: 0, resetOnFalse: true };
                }
            }
            return rules;
        },
        _newGroup: function () {
            var id = 'rule-group-' + Date.now();
            return { id: id, name: 'New Group', enabled: true, match: 'all', activeWindow: { enabled: false, days: [] }, vars: {}, rules: [] };
        },
        _newRule: function () {
            return { id: 'rule-' + Date.now(), name: 'New Rule', enabled: true, match: 'all', conditions: [this._newCondition('temp')], actions: [this._newAction('setCircuit')], otherwiseActions: [], hysteresis: { enabled: false, durationSeconds: 0, resetOnFalse: true } };
        },
        _newCondition: function (type) {
            if (type === 'tempDelta') return { left: 'tempDelta:poolTemp:solarTemp', operator: '>=', right: 5 };
            if (type === 'circuitState') return { left: 'circuit:' + (this._firstRefId('circuit') || '') + ':isOn', operator: 'isTrue' };
            if (type === 'featureState') return { left: 'feature:' + (this._firstRefId('feature') || '') + ':isOn', operator: 'isTrue' };
            if (type === 'runtime') return { left: 'circuit:' + (this._firstRefId('circuit') || '') + ':runtimeMinutes', operator: '>=', right: 10 };
            if (type === 'ruleStable') return { left: 'rule:stableMinutes', operator: '>=', right: 10 };
            if (type === 'bodyHeater') return { left: 'spaHeaterActive', operator: 'isTrue' };
            if (type === 'stateValue') return { left: 'poolTemp', operator: '>', right: 90 };
            return { left: 'poolTemp', operator: '>', right: 90 };
        },
        _newAction: function (type) {
            if (type === 'setFeature') return { type: type, id: this._firstRefId('feature'), state: true };
            if (type === 'circuitLock') return { type: type, id: this._firstRefId('circuit'), state: true };
            if (type === 'featureLock') return { type: type, id: this._firstRefId('feature'), state: true };
            if (type === 'setScheduleDisabled') return { type: type, id: this.options.schedules[0] && this.options.schedules[0].id, state: true };
            if (type === 'log') return { type: type, message: 'Rule matched' };
            return { type: 'setCircuit', id: this._firstRefId('circuit'), state: true };
        },
        _conditionType: function (condition) {
            var left = String(condition.left || '');
            if (/^(circuit|feature):[^:]+:runtime(Minutes|Seconds)$/.test(left)) return 'runtime';
            if (left.indexOf('rule:stable') === 0) return 'ruleStable';
            if (left.indexOf('circuit:') === 0) return 'circuitState';
            if (left.indexOf('feature:') === 0) return 'featureState';
            if (left.indexOf('tempDelta:') === 0) return 'tempDelta';
            if (['spaHeaterActive', 'spaHeatModeOn', 'poolHeaterActive', 'poolHeatModeOn'].indexOf(condition.left) >= 0) return 'bodyHeater';
            if (['poolTemp', 'spaTemp', 'bodyTemp', 'solarTemp', 'airTemp', 'dewPoint', 'poolSolarDelta', 'spaSolarDelta', 'bodySolarDelta'].indexOf(condition.left) >= 0) return 'temp';
            return 'stateValue';
        },
        _parseTempDelta: function (left) {
            var parts = String(left || '').split(':');
            return {
                left: parts[0] === 'tempDelta' && parts[1] ? parts[1] : 'poolTemp',
                right: parts[0] === 'tempDelta' && parts[2] ? parts[2] : 'solarTemp'
            };
        },
        _tempDeltaValue: function (left, right) {
            return 'tempDelta:' + (left || 'poolTemp') + ':' + (right || 'solarTemp');
        },
        _heaterValue: function (body, mode) {
            return body === 'pool' ? (mode === 'mode' ? 'poolHeatModeOn' : 'poolHeaterActive') : (mode === 'mode' ? 'spaHeatModeOn' : 'spaHeaterActive');
        },
        _parseStatePath: function (left, fallback) {
            var parts = String(left || '').split(':');
            return { kind: parts[0] || fallback, id: parseInt(parts[1], 10) || this._firstRefId(fallback) };
        },
        _parseRuntimePath: function (left) {
            var parts = String(left || '').split(':');
            var kind = parts[0] === 'feature' ? 'feature' : 'circuit';
            var metric = parts[2] === 'runtimeSeconds' ? 'runtimeSeconds' : 'runtimeMinutes';
            return { kind: kind, id: parseInt(parts[1], 10) || this._firstRefId(kind), metric: metric };
        },
        _runtimeValue: function (kind, id, metric) {
            return (kind === 'feature' ? 'feature' : 'circuit') + ':' + (id || '') + ':' + (metric === 'runtimeSeconds' ? 'runtimeSeconds' : 'runtimeMinutes');
        },
        _firstRefId: function (kind) {
            var ref = this.options.circuitRefs.find(function (r) { return r.equipmentType === kind; });
            return ref ? ref.id : undefined;
        },
        _refById: function (id) {
            return this.options.circuitRefs.find(function (r) { return r.id === id; });
        },
        _refByKindAndId: function (kind, id) {
            return this.options.circuitRefs.find(function (r) { return r.equipmentType === kind && r.id === id; });
        },
        _parseInput: function (value) {
            if (value === 'true') return true;
            if (value === 'false') return false;
            if (value !== '' && !isNaN(Number(value))) return Number(value);
            return value;
        },
        _valueText: function (value) {
            return typeof value === 'undefined' ? '' : String(value);
        },
        _showJsonEditor: function () {
            var self = this;
            var dlg = $.pic.modalDialog.createDialog('dlgRulesJson', {
                width: '760px',
                height: 'auto',
                title: 'Rules JSON',
                buttons: [
                    {
                        text: 'Save', icon: '<i class="fas fa-save"></i>',
                        click: function () {
                            try {
                                self.options.rules = self._normalizeRules(JSON.parse(dlg.find('textarea').val()));
                                $.pic.modalDialog.closeDialog(this);
                                self._save();
                            } catch (err) {
                                $('<div></div>').appendTo(dlg).fieldTip({ message: 'Invalid JSON: ' + err.message });
                            }
                        }
                    },
                    { text: 'Cancel', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } }
                ]
            });
            $('<textarea></textarea>').css({ width: '100%', height: '26rem', fontFamily: 'monospace', fontSize: '.8rem' })
                .val(JSON.stringify(self.options.rules, null, 2)).appendTo(dlg);
        },
        _save: function () {
            var self = this;
            $.putApiService('config/temperatureLabels', self.options.temperatureLabels || self._normalizeTemperatureLabels(), 'Saving Rules...', function (labels) {
                self.options.temperatureLabels = self._normalizeTemperatureLabels(labels);
                $.putApiService('config/rules', self.options.rules, 'Saving Rules...', function (saved) {
                    self.options.rules = self._normalizeRules(saved);
                    self.options.dirty = false;
                    self._syncSelection();
                    self._buildControls();
                    self._refreshHeaderStatus();
                });
            });
        },
        _isCollapsed: function () {
            return getStorage('picRulesCollapsed', 'false') === 'true';
        },
        _setCollapsed: function (collapsed) {
            setStorage('picRulesCollapsed', collapsed === true ? 'true' : 'false');
        }
    });
})(jQuery);
