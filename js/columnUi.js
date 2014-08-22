/*jslint nomen:true, browser: true */
/*global define: false */

define(['stub', 'haml!haml/columnUi', 'haml!haml/columnUiSelect', 'haml!haml/tupleDisplay', 'colorBar', 'columnMenu', 'config', 'crosshairs', 'defaultTextInput', 'defer', 'tooltip', 'util', 'lib/d3', 'jquery', 'lib/select2', 'lib/underscore', 'xenaQuery', 'rx'
	// non-object dependenciies
	], function (stub, template, selectTemplate, tupleTemplate, colorBar, columnMenu, config, crosshairs, defaultTextInput, defer, tooltip, util, d3, $, select2, _, xenaQuery, Rx) {
	'use strict';

	var APPLY = true,
		STATIC_URL = config.STATIC_URL,
		menuImg = STATIC_URL + 'heatmap-cavm/images/menu.png',
		each = _.each,
		filter = _.filter,
		find = _.find,
		map = _.map,
		reduce = _.reduce,
		toNumber = _.toNumber,
		uniqueId = _.uniqueId,
		sFeatures = { // TODO for demo
			impact: 'impact', // shorttitle ?
			DNA_AF: 'DNA allele frequency',
			RNA_AF: 'RNA allele frequency'
		},
		//dsTitles = {}, // TODO for demo
		/*
		defTitles = {
			cna: 'copy number',
			DNAMethylation: 'DNA methylation',
			geneExp: 'gene expression',
			RNAseqExp: 'RNA sequence expression',
			arrayExp: 'array expression',
			somaticMutation: 'somatic mutation',
			mutationVector: 'mutation vector',
			protein: 'protein',
			clinical: 'clinical feature'
		},
		*/
		widgets = {},
		aWidget;
	/*
	dsTitles[stub.getDEV_URL() + "/TARGET/TARGET_neuroblastoma/cnv.matrix"] = 'Copy number';
	dsTitles[stub.getDEV_URL() + "/TARGET/TARGET_neuroblastoma/rma.Target190.Probeset.Full"] = 'Gene expression, array';
	dsTitles[stub.getDEV_URL() + "/TARGET/TARGET_neuroblastoma/NBL_10_RNAseq_log2"] = 'Gene expression, RNAseq';
	dsTitles[stub.getDEV_URL() + "/TARGET/TARGET_neuroblastoma/mutationGene"] = 'Mutations, gene';
	dsTitles[stub.getDEV_URL() + "/TARGET/TARGET_neuroblastoma/TARGET_neuroblastoma_clinicalMatrix"] = ' ';

	function datasetTitle(dsID, title) {
		return dsTitles[dsID] || title;
	}
	*/
	aWidget = {
		// this is invoked from columnMenu.js: remove menu function
		destroy: function () {
			this.title.destroy();
			this.field.destroy();
			this.$el.remove();
			this.crosshairs.destroy();
			// TODO clean up subscriptions, subWidgets, like exonRefGene, mutationVector
			delete widgets[this.id];
			$('.spreadsheet').resize();
		},

		someMouseenterLeave: function (e) {
			var $hoverShow = $(e.target);
			if (e.type === 'mouseenter') {
				$hoverShow.removeClass('recede');
			} else {
				$hoverShow.addClass('recede');
				$hoverShow.blur();
			}
		},

		mouseenterLeave: function (e) {
			var $hoverShow = this.$el.find('.hoverShow');
			if (e.type === 'mouseenter') {
				$hoverShow.removeClass('recede');
			} else {
				$hoverShow.addClass('recede');
				$hoverShow.blur();
			}
		},

		getDefTitle: function () {
			var dsID = this.ws.column.dsID;
			return this.sheetWrap.sources.map(function (sources) {
				var dataset = xenaQuery.find_dataset(sources, dsID);
				if (dsID === stub.getDEV_URL() + '/TARGET/TARGET_neuroblastoma/TARGET_neuroblastoma_mutationVector') {
					return 'Mutation';
				} else if (!dataset) {
					return "<unknown>";
				} else {
					return dataset.title;
					//return datasetTitle(dsID, dataset.title);
				}
			});
		},

		getDefField: function () {
			var ui = this.ws.column.ui,
				defalt = Rx.Observable.return(this.ws.column.fields.toString()
					+ ((ui.dataSubType === 'mutationVector')
						? ': ' + sFeatures[ui.sFeature]
						: ''));

			if (ui.dataSubType === 'phenotype') {
				defalt = xenaQuery.feature_list(this.ws.column.dsID)
					.pluck(ui.feature);
			}
			return defalt;
		},

		drawLegend: function (colors, labels, align, ellipsis, klass) {
			var label = '';
			if ($('.columnUi').index(this.$el) === 0) {
				label = 'Legend';
			}
			this.$colorBarLabel
				.val(label)
				.addClass(klass);
			labels.reverse();
			this.$colorBarEllipsis.text(ellipsis);
			colorBar.create(this.id, {
				$prevRow: this.$colorBarLabelRow,
				colors: colors.reverse().concat('#808080'),
				labels: labels.concat('NA'),
				tooltips: labels.concat('No data'),
				align: align,
				klass: klass
			});
		},

		reRender: function (options) {
			var ui = options.ws.column.ui;
			this.ws = options.ws;
			this.title = defaultTextInput.create('title_' + this.id, {
				$el: this.$columnTitle,
				getDefault: this.getDefTitle
			});
			this.field = defaultTextInput.create('field_' + this.id, {
				$el: this.$field,
				getDefault: this.getDefField
			});
		},

		firstRender: function (options) {
			var self = this,
				$anchor = $(options.ws.el),
				ui = options.ws.column.ui;
			this.sheetWrap = options.sheetWrap;
			this.$el = $(template({
				features: undefined,
				menuImg: menuImg,
				debugId: this.id
			}));
			$anchor.append(this.$el);

			// adjust to default column dimensions
			this.$el.parent().css('margin-left', this.horizontalMargin);
			this.$el.parent().css('margin-right', this.horizontalMargin);
			this.$el.find('.sparsePad').height(this.sparsePad);
			this.$el.find('.headerPlot').height(this.headerPlotHeight);

			// cache jquery objects for active DOM elements
			this.cache = ['more', 'titleRow', 'columnTitle', 'fieldRow', 'field', 'headerPlot', 'sparsePad', 'samplePlot', 'colorBarLabelRow', 'colorBarLabel', 'colorBarEllipsis'];
			_(self).extend(_(self.cache).reduce(function (a, e) { a['$' + e] = self.$el.find('.' + e); return a; }, {}));
			this.columnMenu = columnMenu.create(this.id, {
				anchor: this.$more,
				columnUi: this,
				deleteColumn: this.sheetWrap.deleteColumn,
				duplicateColumn: this.sheetWrap.duplicateColumn,
				sheetWrap: this.sheetWrap
			});
			this.$el // TODO use rx handlers?
				.on('mouseenter mouseleave', '.columnTitle, .field', this.someMouseenterLeave)
				.on('mouseenter mouseleave', this.mouseenterLeave);

			this.reRender(options);
		},

		render: function (options) {
			if (this.$el) {
				// TODO this should be smarter about using the state tree
				//      and only reRender when needed
				this.reRender(options);
			} else {
				this.firstRender(options);
			}
		},

		initialize: function (options) {
			_.bindAll.apply(_, [this].concat(_.functions(this)));
			//_(this).bindAll();
			this.sheetWrap = options.sheetWrap;
			this.sparsePad = options.sparsePad;
			this.headerPlotHeight = options.headerPlotHeight;
			this.horizontalMargin = options.horizontalMargin.toString() + 'px';
			if (options.ws) {
				this.render(options);
			}
			this.crosshairs = crosshairs.create(this.id, { $anchor: this.$samplePlot });

			this.$samplePlot.onAsObservable('click')
				.filter(function (ev) {
					return ev.altKey === true;
				})
				.subscribe(tooltip.toggleFreeze); // TODO free subscription
		}
	};

	function create(id, options) {
		var w = Object.create(aWidget);
		w.id = id;
		w.initialize(options);
		return w;
	}

	return {
		show: function (id, options) {
			var widget = widgets[id];
			if (widget) {
				widget.render(options);
			} else {
				widget = widgets[id] = create(id, options);
			}
			return widget;
		}
	};
});
