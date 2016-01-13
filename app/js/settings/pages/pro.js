/**
 * The Pro settings page
 */
define([
	"lodash", "moment", "core/auth", "modals/alert", "i18n/i18n", "storage/storage", "storage/syncapi", "settings/page", "core/uservoice", "settings/pro-checkout"
], function(_, moment, Auth, Alert, Translate, Storage, SyncAPI, Page, UserVoice, Checkout) {
	if (!Auth.isPro) {
		var PromoView = Page.extend({
			id: "pro",
			className: "promo",

			events: {
				"click button.upgrade": function() {
					var container = this.$el;

					if (!Auth.isSignedIn) {
						Alert({
							confirm: true,
							title: Translate("settings.pro.checkout.signin"),
							contents: [Translate("settings.pro.checkout.signin_desc")],
							buttons: {
								positive: Translate("settings.pro.checkout.signin_btn")
							}
						}, function() {
							Alert({
								title: Translate("settings.accounts.keep_data"),
								contents: [Translate("settings.accounts.keep_data_desc")],
								buttons: {
									negative: Translate("settings.accounts.keep_account"),
									positive: Translate("settings.accounts.keep_local")
								}
							}, function(sendData) {
								Storage.on("done", function(storage) {
									SyncAPI.authorize(storage, sendData, function() {
										if (Auth.isPro) {
											location.reload();
										}
										else {
											new Checkout({
												container: container
											});
										}
									});
								});
							});
						});

						return;
					}

					new Checkout({
						container: container
					});
				},

				"click header .business a": function(e) {
					e.preventDefault();

					UserVoice("show", { mode: "contact" });
				}
			},

			onInputChange: _.noop,

			onBeforeRender: function(data) {
				if (this._rendered) {
					return false;
				}

				this._rendered = true;

				return data;
			}
		});

		return PromoView;
	}

	var View = Page.extend({
		id: "pro",

		events: {
			"click section.plan button.update-plan, section.plan button.update-billing": function() {
				new Checkout({
					update: true,
					container: this.$el
				});
			},

			"click section.plan button.cancel": function() {
				Alert({
					confirm: true,
					contents: [Translate("settings.pro.plan.cancel_notice"), Translate("settings.pro.plan.cancel_notice2")]
				}, function() {
					Auth.ajax({
						method: "PUT",
						url: "/billing/v1/plan",
						data: {
							plan: "free"
						},
						success: function(d) {
							if (!d || !d.authToken) {
								return;
							}

							Auth.set("token", d.authToken);

							location.reload();
						}
					});
				});
			}
		},

		// If no properties are provided then all changes will be monitored
		monitorProps: ["nonExistentProperty"],

		loadPlan: function() {
			Auth.ajax({
				method: "GET",
				url: "/billing/v1/plan",
				success: function(d) {
					if (!d) {
						return;
					}

					this._subscriptionInfo = {
						status: Translate("settings.pro.plan.status_" + d.status),
						subscriptionDate: moment.utc(d.subscribed).format("LL"),
						paidThrough: moment.utc(d.paidThrough).format("LL"),
						nextBill: Translate("settings.pro.plan.next_bill_value", d.nextBillAmount * 1, moment.utc(d.nextBillDate).format("LL"))
					};

					this.render();
				}.bind(this)
			});
		},

		initialize: function() {
			this.listenTo(Auth, "change", function() {
				this._subscriptionInfo = null;

				this.render();

				this.loadPlan();
			});

			this.loadPlan();
		},

		onInputChange: _.noop,

		onBeforeRender: function() {
			var plan = (Auth.get("plan") || "").replace("pro_", "");

			var ret = {
				uneditable: plan && plan !== "monthly" && plan !== "yearly",
				desc: Translate("settings.pro.plan.desc", Translate("settings.pro.plan.types." + plan))
			};

			if (this._subscriptionInfo) {
				_.assign(ret, this._subscriptionInfo);
			}

			return ret;
		}
	});

	return View;
});