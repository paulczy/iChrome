/**
 * The tabs view.  This does the actual rendering of data, creaton of columns and widget insertion.
 */
define(["jquery", "lodash", "backbone", "core/status", "core/analytics", "i18n/i18n"], function($, _, Backbone, Status, Track, Translate) {
	var GRID_SIZE = 10;

	var view = Backbone.View.extend({
		tagName: "div",
		className: function() {
			return "tab" + (this.model.get("isGrid") ? " grid" : "");
		},

		initialize: function() {
			this.model.on("columns:sort columns:update columns:reset update:columns change:fixed change:isGrid", function() {
				var options = _.last(arguments);

				if (!(options && options.noRefresh)) {
					this.render();
				}
			}, this);

			this.render(true);
		},


		/**
		 * Serializes the widgets and columns into a JSON object, updating the model in the process
		 *
		 * @api    public
		 * @param  {Boolean} [trigger] Whether or not to trigger a sort event for this serialize
		 * @return {Object}  The serialized tab
		 */
		serialize: function(trigger) {
			var columns = [];

			if (this.model.get("isGrid")) {
				var column = [];

				this.$(".widget").each(function() {
					var that = $(this),
						widget = that.data("view");

					var loc = [
						Math.round(that.position().top / GRID_SIZE),
						Math.round(that.position().left / GRID_SIZE),
						Math.round(that.outerWidth() / GRID_SIZE),
						Math.round(that.outerHeight() / GRID_SIZE)
					];

					if (loc[0] < 0) {
						loc[0] = 0;
					}

					if (loc[1] < 0) {
						loc[1] = 0;
					}

					// This is silent so a save isn't triggered prematurely
					widget.model.set("loc", loc, { silent: true });

					column.push(widget);
				});

				columns.push(column);
			}
			else {
				this.$(".widgets-container > .column").each(function() {
					var column = [];

					$(this).children(".widget").each(function() {
						column.push($(this).data("view"));
					});

					columns.push(column);
				});
			}

			_.each(columns, function(column, i) {
				var collection = this.model.columns[i];

				// Only update the collection if the order is different from the columns
				if (_.pluck(collection.views, "cid").join(" ") !== _.pluck(column, "cid").join(" ")) {
					// Remove the old models and views
					collection.remove(
						_(collection.views).difference(column).each(function(e) {
							// If the element is still in the document then it was just moved out
							// of this tab, don't destroy it
							if (!$.contains(document.documentElement, e.el)) {
								// Again, silenced to avoid premature event triggering
								collection.removeView(e, true);
							}
							else {
								// This has to splice so the remove call, which calls removeView,
								// won't destroy the element
								collection.views.splice(collection.views.indexOf(e), 1);
							}
						}).pluck("model").valueOf(),
						{ silent: true }
					);


					// Insert the new ones.  Backbone needs to set up references so these can't be directly inserted
					collection.add(_(column).difference(collection.views).pluck("model").valueOf(), { silent: true });


					// Sort the models to match the views, see lib/backbone.viewcollection for comments
					var cids = _.pluck(_.pluck(column, "model"), "cid"),
						order = _.zipObject(cids, cids.map(function(e, i) {
							return i + 1;
						}));

					collection.models = _.sortBy(collection.models, function(e) {
						return order[e.cid] || Infinity;
					});


					// And then the views to match the new model order
					collection.sortViews(true);
				}
			}, this);

			this.model.serializeColumns(true);


			if (trigger) {
				this.model.trigger("sort", this.model, this.model.columns);

				// Since the render only inserts columns and widgets it's not expensive
				// This is called in requestAnimationFrame so there isn't a visible freeze
				window.requestAnimationFrame(this.render.bind(this));
			}

			return columns;
		},


		/**
		 * Initializes sortable.
		 *
		 * By the time this is called the sortable group has already been initialized, this simply adds
		 * the views columns
		 *
		 * @api    private
		 */
		sortable: function() {
			this.$("> .remove, > .widgets-container.grid, > .widgets-container > .column").sortable({
				group: "columns",
				handle: ".handle",
				itemSelector: "section",
				placeholder: "<section class=\"placeholder\"/>"
			});
		},


		/**
		 * Initializes widget resizing for grid-based tabs
		 *
		 * @api    private
		 */
		resizable: function() {
			var body = $(document.body),
				serialize = this.serialize.bind(this);

			this.$el.off("mousedown").on("mousedown", ".widget > .resize", function(e) {
				var startX = e.pageX,
					startY = e.pageY,
					widget = this.parentNode,
					startWidth = widget.offsetWidth,
					startHeight = widget.offsetHeight,

					grid = widget.parentNode,
					tc = body.children(".tab-container")[0],
					tcHeight = tc.offsetHeight,
					gridMax = tcHeight - 50,
					h;

				_.each(grid.querySelectorAll(".widget"), function(e) {
					h = e.offsetTop + e.offsetHeight;

					if (h >= gridMax) { gridMax = h; }
				});

				body.addClass("resizing").on("mousemove.widgetResize", function(e) {
					e.preventDefault();

					// -1 so it lines up with the insides of the grid squares
					widget.style.width = ((Math.round((startWidth + (e.pageX - startX)) / GRID_SIZE) * GRID_SIZE) - 1) + "px";
					widget.style.height = ((Math.round((startHeight + (e.pageY - startY)) / GRID_SIZE) * GRID_SIZE) - 1) + "px";


					var max = widget.offsetTop + widget.offsetHeight;

					if (gridMax > max) {
						max = gridMax;
					}

					grid.style.height = (max + 50) + "px";
				}).on("mouseup.widgetResize", function() {
					body.removeClass("resizing").off("mousemove.widgetResize mouseup.widgetResize");

					serialize(true);
				});
			});
		},


		/**
		 * Overrides Backbone's remove method
		 *
		 * @api    private
		 * @param  {sortable} [sortable] Whether or not only sortable should be removed
		 */
		remove: function(sortable) {
			// jQuery sortable doesn't have a method for removing containers from
			// groups without destroying the entire group or for accessing them directly.
			//
			// So, we have to get the rootGroup directly from an element's `data` which we
			// can then cleanup.
			var elms = this.$("> .remove, > .widgets-container.grid, > .widgets-container > .column"),
				dta = elms.first().data("sortable");

			if (dta) {
				var rootGroup = dta.rootGroup;

				_.remove(rootGroup.containers, function(e) {
					return elms.filter(e.el).length >= 1;
				});
			}


			if (sortable !== true) {
				Backbone.View.prototype.remove.call(this);
			}
		},


		render: function(initial) {
			// Remove sortable
			if (initial !== true) {
				this.remove(true);

				// If the sub-views are not detached before $.html() is called,
				// their data will be removed, destroying all event handlers.
				this.$("> .widgets-container > .column > .widget, > .widgets-container.grid > .widget").detach();

				// Call $.html() to remove any data or events related to $.sortable
				this.$el.html("");
			}


			var isGrid = this.model.get("isGrid");

			// We use native methods here for speed
			this.el.innerHTML = '<div class="remove">' + Translate("remove_widget") + '</div>';


			var main = document.createElement("main");

			main.setAttribute("class", "widgets-container" + (this.model.get("fixed") && !isGrid ? " fixed" : "") + (isGrid ? " grid" : ""));


			var models = _.map(this.model.columns, function(collection) {
				var column = main;

				if (!isGrid) {
					column = document.createElement("div");

					column.setAttribute("class", "column");

					main.appendChild(column);
				}

				_.each(collection.views, function(e) {
					column.appendChild(e.el);
				});

				return collection.models;
			});


			this.el.appendChild(main);


			if (isGrid) {
				var max = this.el.offsetHeight - 50;

				// This is the number of pixels the bottom of the furthest widget is from the top
				var btm = _.max(_.each(_.flatten(models), function(e) {
					var loc = e.get("loc");

					if (loc) {
						return (loc[0] + loc[3]) * GRID_SIZE;
					}

					return 0;
				}));

				if (btm > max) {
					max = btm;
				}

				// The -50 and +50 makes sure that the container is either 50px from the bottom of
				// the last widget or at the bottom of the tab but never past it if it isn't necessary
				main.style.height = (max + 50) + "px";

				this.resizable();
			}


			this.sortable();

			return this;
		}
	});


	return view;
});