/**
 * EGroupware eTemplate2 - JS Link object
 *
 * @license http://opensource.org/licenses/gpl-license.php GPL - GNU General Public License
 * @package etemplate
 * @subpackage api
 * @link https://www.egroupware.org
 * @author Nathan Gray
 * @copyright 2011 Nathan Gray
 */

/*egw:uses
	/vendor/bower-asset/jquery/dist/jquery.js;
	/vendor/bower-asset/jquery-ui/jquery-ui.js;
	et2_core_inputWidget;
	et2_core_valueWidget;
	et2_widget_selectbox;
	expose;

	// Include menu system for list context menu
	egw_action.egw_menu_dhtmlx;
*/

import {et2_createWidget, et2_register_widget, et2_widget, WidgetConfig} from "./et2_core_widget";
import {ClassWithAttributes} from "./et2_core_inheritance";
import {et2_valueWidget} from "./et2_core_valueWidget";
import {et2_inputWidget} from "./et2_core_inputWidget";
import {et2_selectbox} from "./et2_widget_selectbox";
import {et2_button} from "./et2_widget_button";
import {et2_dialog} from "./et2_widget_dialog";
import {et2_file} from "./et2_widget_file";
import {et2_vfsSelect} from "./et2_widget_vfs";
import {egw, egw_get_file_editor_prefered_mimes} from "../jsapi/egw_global";
import {et2_tabbox} from "./et2_widget_tabs";
import {et2_csvSplit, et2_no_init} from "./et2_core_common";
import {et2_IDetachedDOM, et2_IExposable} from "./et2_core_interfaces";
import {expose} from "./expose";
import {egwMenu} from "../egw_action/egw_menu.js";

/**
 * UI widgets for Egroupware linking system
 */
export class et2_link_to extends et2_inputWidget
{
	static readonly _attributes: any = {
		"only_app": {
			"name": "Application",
			"type": "string",
			"default": "",
			"description": "Limit to just this one application - hides app selection"
		},
		"application_list": {
			"name": "Application list",
			"type": "any",
			"default": "",
			"description": "Limit to the listed application or applications (comma seperated)"
		},
		"blur": {
			"name": "Placeholder",
			"type": "string",
			"default": "",
			"description": "This text get displayed if an input-field is empty and does not have the input-focus (blur). It can be used to show a default value or a kind of help-text.",
			translate: true
		},
		"no_files": {
			"name": "No files",
			"type": "boolean",
			"default": false,
			"description": "Suppress attach-files"
		},
		"search_label": {
			"name": "Search label",
			"type": "string",
			"default": "",
			"description": "Label to use for search"
		},
		"link_label": {
			"name": "Link label",
			"type": "string",
			"default": "Link",
			"description": "Label for the link button"
		},
		"value": {
			// Could be string or int if application is provided, or an Object
			"type": "any"
		}
	};

	private div: JQuery;
	private link_button: JQuery;
	private link_div: JQuery;
	private filemanager_button: JQuery;
	private file_div: JQuery;
	private status_span: JQuery;
	private link_entry: et2_link_entry;
	private vfs_select: et2_vfsSelect;
	private file_upload: et2_file;


	/**
	 * Constructor
	 *
	 * @memberOf et2_link_to
	 */
	constructor(_parent: et2_widget, _attrs?: WidgetConfig, _child?: object)
	{
		super(_parent, _attrs, ClassWithAttributes.extendAttributes(et2_link_to._attributes, _child || {}));

		this.div = jQuery(document.createElement("div")).addClass("et2_link_to et2_toolbar");

		this.link_button = null;
		this.status_span = null;

		this.link_entry = null;
		this.file_upload = null;

		this.createInputWidget();
	}

	destroy()
	{
		this.link_button = null;
		this.status_span = null;

		if (this.link_entry)
		{
			this.link_entry.destroy();
			this.link_entry = null;
		}
		if (this.file_upload)
		{
			this.file_upload.destroy();
			this.file_upload = null;
		}
		this.div = null;

		super.destroy.apply(this, arguments);
	}

	/**
	 * Override to provide proper node for sub widgets to go in
	 *
	 * @param {Object} _sender
	 */
	getDOMNode(_sender)
	{
		if (_sender == this)
		{
			return this.div[0];
		}
		else if (_sender._type == 'link-entry')
		{
			return this.link_div[0];
		}
		else if (_sender._type == 'file')
		{
			return this.file_div[0];
		}
		else if (_sender._type == 'vfs-select')
		{
			return this.filemanager_button[0];
		}
	}

	createInputWidget()
	{

		// Need a div for file upload widget
		this.file_div = jQuery(document.createElement("div")).css({display: 'inline-block'}).appendTo(this.div);

		// Filemanager link popup
		this.filemanager_button = jQuery(document.createElement("div")).css({display: 'inline-block'}).appendTo(this.div);

		// Need a div for link-to widget
		this.link_div = jQuery(document.createElement("div"))
			.addClass('div_link')
			// Leave room for link button
			.appendTo(this.div);

		if (!this.options.readonly)
		{
			// One common link button
			this.link_button = jQuery(document.createElement("button"))
				.text(this.egw().lang(this.options.link_label))
				.appendTo(this.div).hide()
				.addClass('link')
				.click(this, this.createLink);

			// Span for indicating status
			this.status_span = jQuery(document.createElement("span"))
				.appendTo(this.div).addClass("status").hide();
		}

		this.setDOMNode(this.div[0]);
	}

	doLoadingFinished()
	{
		super.doLoadingFinished.apply(this, arguments);

		var self = this;
		if (this.link_entry && this.vfs_select && this.file_upload)
		{
			// Already done
			return false;
		}

		// Link-to
		var link_entry_attrs = {
			id: this.id + '_link_entry',
			only_app: this.options.only_app,
			application_list: this.options.application_list,
			blur: this.options.search_label ? this.options.search_label : this.egw().lang('Search...'),
			query: function ()
			{
				self.link_button.hide();
				return true;
			},
			select: function ()
			{
				self.link_button.show();
				return true;
			},
			readonly: this.options.readonly
		};
		this.link_entry = <et2_link_entry>et2_createWidget("link-entry", link_entry_attrs, this);

		// Filemanager select
		var select_attrs: any = {
			button_label: egw.lang('Link'),
			button_caption: '',
			button_icon: 'link',
			readonly: this.options.readonly,
			dialog_title: egw.lang('Link'),
			extra_buttons: [{text: egw.lang("copy"), id: "copy", image: "copy"},
				{text: egw.lang("move"), id: "move", image: "move"}],
			onchange: function ()
			{
				var values = true;
				// If entry not yet saved, store for linking on server
				if (!self.options.value.to_id || typeof self.options.value.to_id == 'object')
				{
					values = self.options.value.to_id || {};
					var files = self.vfs_select.getValue();
					if (typeof files !== 'undefined')
					{
						for (var i = 0; i < files.length; i++)
						{
							values['link:' + files[i]] = {
								app: 'link',
								id: files[i],
								type: 'unknown',
								icon: 'link',
								remark: '',
								title: files[i]
							};
						}
					}
				}
				self._link_result(values);
			}
		};
		// only set server-side callback, if we have a real application-id (not null or array)
		// otherwise it only gives an error on server-side
		if (self.options.value && self.options.value.to_id && typeof self.options.value.to_id != 'object')
		{
			select_attrs.method = 'EGroupware\\Api\\Etemplate\\Widget\\Link::ajax_link_existing';
			select_attrs.method_id = self.options.value.to_app + ':' + self.options.value.to_id;
		}
		this.vfs_select = <et2_vfsSelect>et2_createWidget("vfs-select", select_attrs, this);
		this.vfs_select.set_readonly(this.options.readonly);

		// File upload
		var file_attrs = {
			multiple: true,
			id: this.id + '_file',
			label: '',
			// Make the whole template a drop target
			drop_target: this.getInstanceManager().DOMContainer.getAttribute("id"),
			readonly: this.options.readonly,

			// Change to this tab when they drop
			onStart: function (event, file_count)
			{
				// Find the tab widget, if there is one
				var tabs: et2_widget = self;
				do
				{
					tabs = tabs.getParent();
				}
				while (tabs != self.getRoot() && tabs.getType() != 'tabbox');
				if (tabs != self.getRoot())
				{
					(<et2_tabbox><unknown>tabs).activateTab(self);
				}
				return true;
			},
			onFinish: function (event, file_count)
			{
				event.data = self;
				self.filesUploaded(event);

				// Auto-link uploaded files
				self.createLink(event);
			}
		};

		this.file_upload = <et2_file>et2_createWidget("file", file_attrs, this);
		this.file_upload.set_readonly(this.options.readonly);
		return true;
	}

	getValue()
	{
		return this.options.value;
	}

	filesUploaded(event)
	{
		var self = this;

		this.link_button.show();
	}

	/**
	 * Create a link using the current internal values
	 *
	 * @param {Object} event
	 */
	createLink(event)
	{
		// Disable link button
		event.data.link_button.attr("disabled", true);

		var values = event.data.options.value;
		var self = event.data;

		var links = [];

		// Links to other entries
		event.data = self.link_entry;
		self.link_entry.createLink(event, links);

		// Files
		if (!self.options.no_files)
		{
			for (var file in self.file_upload.options.value)
			{

				links.push({
					app: 'file',
					id: file,
					name: self.file_upload.options.value[file].name,
					type: self.file_upload.options.value[file].type,
					remark: jQuery("li[file='" + self.file_upload.options.value[file].name.replace(/'/g, '&quot') + "'] > input", self.file_upload.progress)
						.filter(function ()
						{
							return jQuery(this).attr("placeholder") != jQuery(this).val();
						}).val()
				});
			}
		}
		if (links.length == 0)
		{
			return;
		}

		var request = egw.json("EGroupware\\Api\\Etemplate\\Widget\\Link::ajax_link",
			[values.to_app, values.to_id, links],
			self._link_result,
			self,
			true,
			self
		);
		request.sendRequest();
	}

	/**
	 * Sent some links, server has a result
	 *
	 * @param {Object} success
	 */
	_link_result(success)
	{
		if (success)
		{
			this.link_button.hide().attr("disabled", false);
			this.status_span.removeClass("error").addClass("success");
			this.status_span.fadeIn().delay(1000).fadeOut();
			delete this.options.value.app;
			delete this.options.value.id;
			for (var file in this.file_upload.options.value)
			{
				delete this.file_upload.options.value[file];
			}
			this.file_upload.progress.empty();

			// Server says it's OK, but didn't store - we'll send this again on submit
			// This happens if you link to something before it's saved to the DB
			if (typeof success == "object")
			{
				// Save as appropriate in value
				if (typeof this.options.value != "object")
				{
					this.options.value = {};
				}
				this.options.value.to_id = success;
				for (let link in success)
				{
					// Icon should be in registry
					if (typeof success[link].icon == 'undefined')
					{
						success[link].icon = egw.link_get_registry(success[link].app, 'icon');
						// No icon, try by mime type - different place for un-saved entries
						if (success[link].icon == false && success[link].id.type)
						{
							// Triggers icon by mime type, not thumbnail or app
							success[link].type = success[link].id.type;
							success[link].icon = true;
						}
					}
					// Special handling for file - if not existing, we can't ask for title
					if (success[link].app == 'file' && typeof success[link].title == 'undefined')
					{
						success[link].title = success[link].id.name || '';
					}
				}
			}

			// Look for a link-list with the same ID, refresh it
			var self = this;
			var list_widget = null;
			this.getRoot().iterateOver(
				function (widget)
				{
					if (widget.id == self.id)
					{
						list_widget = widget;
						if (success === true)
						{
							widget._get_links();
						}
					}
				},
				this, et2_link_list
			);

			// If there's an array of data (entry is not yet saved), updating the list will
			// not work, so add them in explicitly.
			if (list_widget && success)
			{
				// Clear list
				list_widget.set_value(null);

				// Add temp links in
				for (var link_id in success)
				{
					let link = success[link_id];
					if (typeof link.title == 'undefined')
					{
						// Callback to server for title
						egw.link_title(link.app, link.id, function (title)
						{
							link.title = title;
							list_widget._add_link(link);
						});
					}
					else
					{
						// Add direct
						list_widget._add_link(link);
					}
				}
			}
		}
		else
		{
			this.status_span.removeClass("success").addClass("error")
				.fadeIn();
		}
		this.div.trigger('link.et2_link_to', success);
	}

	set_no_files(no_files)
	{
		if (this.options.readonly) return;
		if (no_files)
		{
			this.file_div.hide();
			this.filemanager_button.hide();
		}
		else
		{
			this.file_div.show();
			this.filemanager_button.show();
		}
		this.options.no_files = no_files;
	}
}

et2_register_widget(et2_link_to, ["link-to"]);

/**
 * List of applications that support link
 */
export class et2_link_apps extends et2_selectbox
{
	static readonly _attributes: any = {
		"only_app": {
			"name": "Application",
			"type": "string",
			"default": "",
			"description": "Limit to just this one application - hides app selection"
		},
		"application_list": {
			"name": "Application list",
			"type": "any",
			"default": "",
			"description": "Limit to the listed application or applications (comma seperated)"
		}
	};

	/**
	 * Constructor
	 *
	 */
	constructor(_parent: et2_widget, _attrs?: WidgetConfig, _child?: object)
	{
		super(_parent, _attrs, ClassWithAttributes.extendAttributes(et2_link_apps._attributes, _child || {}));


		if (this.options.select_options != null)
		{
			// Preset to last application
			if (!this.options.value)
			{
				this.set_value(egw.preference('link_app', this.egw().getAppName()));
			}
			// Register to update preference
			var self = this;
			this.input.bind("click", function ()
			{
				if (typeof self.options.value != 'undefined') var appname = self.options.value.to_app;
				egw.set_preference(appname || self.egw().getAppName(), 'link_app', self.getValue());
			});
		}
	}

	/**
	 * We get some minor speedups by overriding parent searching and directly setting select options
	 *
	 * @param {Array} _attrs an array of attributes
	 */
	transformAttributes(_attrs)
	{
		var select_options = {};

		// Limit to one app
		if (_attrs.only_app)
		{
			select_options[_attrs.only_app] = this.egw().lang(_attrs.only_app);
		}
		else if (_attrs.application_list)
		{
			select_options = _attrs.application_list;
		}
		else
		{
			select_options = egw.link_app_list('query');
			if (typeof select_options['addressbook-email'] !== 'undefined')
			{
				delete select_options['addressbook-email'];
			}
		}
		_attrs.select_options = select_options;
		super.transformAttributes(_attrs);
	}
}

et2_register_widget(et2_link_apps, ["link-apps"]);

/**
 * Search and select an entry for linking
 */
export class et2_link_entry extends et2_inputWidget
{
	static readonly _attributes: any = {
		"value": {
			"type": "any",
			"default": {}
		},
		"only_app": {
			"name": "Application",
			"type": "string",
			"default": "",
			"description": "Limit to just this one application - hides app selection"
		},
		"application_list": {
			"name": "Application list",
			"type": "any",
			"default": "",
			"description": "Limit to the listed applications (comma seperated)"
		},
		"app_icons": {
			"name": "Application icons",
			"type": "boolean",
			"default": false,
			"description": "Show application icons instead of names"
		},
		"blur": {
			"name": "Placeholder",
			"type": "string",
			"default": et2_no_init,
			"description": "This text get displayed if an input-field is empty and does not have the input-focus (blur). It can be used to show a default value or a kind of help-text.",
			translate: true
		},
		"query": {
			"name": "Query callback",
			"type": "js",
			"default": et2_no_init,
			"description": "Callback before query to server.  It will be passed the request & et2_link_entry objects.  Must return true, or false to abort query."
		},
		"select": {
			"name": "Select callback",
			"type": "js",
			"default": et2_no_init,
			"description": "Callback when user selects an option.  Must return true, or false to abort normal action."
		}
	};

	public static readonly legacyOptions = ["only_app", "application_list"];
	protected static readonly search_timeout = 500; //ms after change to send query
	protected static readonly minimum_characters = 4; // Don't send query unless there's at least this many chars

	private cache: any = {};

	protected div: JQuery;
	protected app_select: JQuery;
	protected search: JQuery;
	protected clear: JQuery;
	protected link_button: JQuery;
	private request: any;
	private last_search: string;
	processing: boolean = false;

	/**
	 * Constructor
	 *
	 * @memberOf et2_link_entry
	 */
	constructor(_parent: et2_widget, _attrs?: WidgetConfig, _child?: object)
	{
		super(_parent, _attrs, ClassWithAttributes.extendAttributes(et2_link_entry._attributes, _child || {}));

		this.search = null;
		this.clear = null;
		this.app_select = null;
		this._oldValue = {
			id: null,
			app: this.options.value && this.options.value.app ? this.options.value.app : this.options.only_app
		};

		if (typeof this.options.value == 'undefined' || this.options.value == null)
		{
			this.options.value = {};
		}
		this.cache = {};
		this.request = null;

		this.createInputWidget();
		var self = this;

		jQuery(this.getInstanceManager().DOMContainer).on('clear', function ()
		{
			// We need to unbind events to prevent a second triggerd event handler
			// (eg. setting a project in infolog edit dialog) when the widget gets cleared.
			jQuery(self.getDOMNode()).off();
		});
	}

	destroy()
	{
		super.destroy.apply(this, arguments);

		this.div = null;
		if (this.search.data("ui-autocomplete"))
		{
			this.search.autocomplete("destroy");
		}
		this.search = null;
		this.clear = null;
		this.app_select = null;
		this.request = null;
	}

	createInputWidget()
	{
		var self = this;
		this.div = jQuery(document.createElement("div")).addClass("et2_link_entry");

		// Application selection
		jQuery.widget("custom.iconselectmenu", jQuery.ui.selectmenu, {
			_renderButtonItem: function (value)
			{
				var _value = value.value;
				var url = self.egw().image('navbar', _value);
				var buttonItem = jQuery("<span>", {
					"class": "ui-selectmenu-text",
					title: value.label
				});

				buttonItem.css('background-image', 'url(' + url + ')');
				return buttonItem;
			},
			_renderItem: function (ul, item)
			{
				var li = jQuery("<li>", {class: "et2_link_entry_app_option"}),
					wrapper = jQuery("<div>", {text: item.label});

				if (item.disabled)
				{
					li.addClass("ui-state-disabled");
				}
				ul.addClass(self.div.attr("class"));
				var url = self.egw().image('navbar', item.value);
				jQuery("<span>", {
					style: 'background-image: url("' + url + '");',
					"class": "ui-icon " + item.element.attr("data-class"),
					title: item.label
				})
					.appendTo(wrapper);

				return li.append(wrapper).appendTo(ul);
			}
		});

		this.app_select = jQuery(document.createElement("select")).appendTo(this.div)
			.change(function (e)
			{
				// Clear cache when app changes
				self.cache = {};

				// Update preference with new value
				egw.set_preference(self.options.value.to_app || self.egw().getAppName(), 'link_app', self.app_select.val());

				if (typeof self.options.value != 'object') self.options.value = {};
				self.options.value.app = self.app_select.val();
			})
			.attr("aria-label", egw.lang("linkapps"));
		var opt_count = 0;
		for (var key in this.options.select_options)
		{
			opt_count++;
			var option = jQuery(document.createElement("option"))
				.attr("value", key)
				.text(this.options.select_options[key]);
			option.appendTo(this.app_select);
		}
		if (this.options.only_app)
		{
			this.app_select.val(this.options.only_app);
			this.app_select.hide();
			if (this.options.app_icons && this.app_select.iconselectmenu('instance'))
			{
				this.app_select.iconselectmenu('widget').hide();
			}
			this.div.addClass("no_app");
		}
		else
		{
			// Now that options are in, set to last used app
			this.app_select.val(this.options.value.app || '');
			if (this.app_select.iconselectmenu('instance'))
			{
				this.app_select.iconselectmenu('update');
			}
		}

		// Search input
		this.search = jQuery(document.createElement("input"))
			// .attr("type", "search") // Fake it for all browsers below
			.focus(function ()
			{
				if (!self.options.only_app)
				{
					// Adjust width, leave room for app select & link button
					self.div.removeClass("no_app");
					if (self.options.app_icons)
					{
						self.app_select.iconselectmenu('widget').show();
					}
					else
					{
						self.app_select.show();
					}
				}
			})
			.blur(function (e)
			{
				if (self.div.has(e.relatedTarget).length) return;
				if (self.options.app_icons)
				{
					// Adjust width, leave room for app select & link button
					self.div.addClass("no_app");
					self.app_select.iconselectmenu('widget').hide();
				}
				else if (self.search.val())
				{
					if (self.options.only_app)
					{
						// Adjust width, leave room for app select & link button
						self.div.addClass("no_app");
					}
				}
			})
			.attr("aria-label", egw.lang("Link search"))
			.attr("role", "searchbox")
			.appendTo(this.div);

		this.set_blur(this.options.blur ? this.options.blur : this.egw().lang("search"), this.search);

		// Autocomplete
		this.search.autocomplete({
			source: function (request, response)
			{
				return self.query(request, response);
			},
			select: function (event, item)
			{
				event.data = self;
				// Correct changed value from server
				if (item.item.value)
				{
					item.item.value = ("" + item.item.value).trim();
				}
				self.select(event, item);
				return false;
			},
			focus: function (event, item)
			{
				event.stopPropagation();
				self.search.val(item.item.label);
				return false;
			},
			minLength: et2_link_entry.minimum_characters,
			delay: et2_link_entry.search_timeout,
			disabled: self.options.disabled,
			appendTo: self.div
		});

		// Custom display (colors)
		this.search.data("uiAutocomplete")._renderItem = function (ul, item)
		{
			var li = jQuery(document.createElement('li'))
				.data("item.autocomplete", item);
			var extra: any = {};

			// Extra stuff
			if (typeof item.label == 'object')
			{
				extra = item.label;
				item.label = extra.label ? extra.label : extra;
				if (extra['style.backgroundColor'] || extra.color)
				{
					li.css({'border-left': '5px solid ' + (extra.color ? extra.color : extra['style.backgroundColor'])});
				}
				// Careful with this, some browsers may have trouble loading all at once, which can slow display
				if (extra.icon)
				{
					var img = self.egw().image(extra.icon);
					if (img)
					{
						jQuery(document.createElement("img"))
							.attr("src", img)
							.css("float", "right")
							.appendTo(li);
					}
				}
			}

			// Normal stuff
			li.append(jQuery("<a></a>").text(item.label))
				.appendTo(ul);
			window.setTimeout(function ()
			{
				ul.css('max-width', jQuery('.et2_container').width() - ul.offset().left);
			}, 300);
			return li;
		};

		// Bind to enter key to start search early
		this.search.keydown(function (e)
		{
			var keycode = (e.keyCode ? e.keyCode : e.which);
			if (keycode == 13 && !self.processing)
			{
				self.search.autocomplete("option", "minLength", 0);
				self.search.autocomplete("search");
				self.search.autocomplete("option", "minLength", self.minimum_characters);
				return false;
			}
		});

		// Clear / last button
		this.clear = jQuery(document.createElement("span"))
			.addClass("ui-icon ui-icon-close")
			.click(function (e)
			{
				if (!self.search) return;	// only gives an error, we should never get into that situation
				// No way to tell if the results is open, so if they click the button while open, it clears
				if (self.last_search && self.last_search != self.search.val())
				{
					// Repeat last search (should be cached)
					self.search.val(self.last_search);
					self.last_search = "";
					self.search.autocomplete("search");
				}
				else
				{
					// Clear
					self.search.autocomplete("close");
					self.set_value(null);
					self.search.val("");
					// call trigger, after finishing this handler, not in the middle of it
					window.setTimeout(function ()
					{
						self.search.trigger("change");
					}, 0);
				}
				self.search.focus();
			})
			.appendTo(this.div)
			.hide();

		this.setDOMNode(this.div[0]);
	}

	getDOMNode()
	{
		return this.div ? this.div[0] : null;
	}

	transformAttributes(_attrs)
	{
		super.transformAttributes.apply(this, arguments);


		_attrs["select_options"] = {};
		if (_attrs["application_list"])
		{
			var apps = (typeof _attrs["application_list"] == "string") ? et2_csvSplit(_attrs["application_list"], null, ",") : _attrs["application_list"];
			for (var i = 0; i < apps.length; i++)
			{
				_attrs["select_options"][apps[i]] = this.egw().lang(apps[i]);
			}
		}
		else
		{
			_attrs["select_options"] = this.egw().link_app_list('query');
			if (typeof _attrs["select_options"]["addressbook-email"] != 'undefined') delete _attrs["select_options"]["addressbook-email"];
		}

		// Check whether the options entry was found, if not read it from the
		// content array.
		if (_attrs["select_options"] == null)
		{
			_attrs["select_options"] = this.getArrayMgr('content')
				.getEntry("options-" + this.id);
		}

		// Default to an empty object
		if (_attrs["select_options"] == null)
		{
			_attrs["select_options"] = {};
		}
	}

	doLoadingFinished()
	{
		if (typeof this.options.value == 'object' && !this.options.value.app)
		{
			this.options.value.app = egw.preference('link_app', this.options.value.to_app || this.egw().getAppName());
			// If there's no value set for app, then take the first one from the selectbox
			if (typeof this.options.value.app == 'undefined' || !this.options.value.app)
			{
				this.options.value.app = Object.keys(this.options.select_options)[0];
			}
			this.app_select.val(this.options.value.app);
		}

		if (this.options.app_icons)
		{
			var self = this;
			this.div.addClass('app_icons');
			this.app_select.iconselectmenu({
				width: 50,
				change: function ()
				{
					window.setTimeout(function ()
					{
						self.app_select.trigger("change");
					}, 0);
				}
			})
				.iconselectmenu("menuWidget");
			this.app_select.iconselectmenu('widget').hide();
		}
		return super.doLoadingFinished.apply(this, arguments);
	}

	getValue()
	{
		var value = this.options && this.options.only_app ? this.options.value.id : this.options ? this.options.value : null;
		if (this.options && !this.options.only_app && this.search)
		{
			value.search = this.search.val();
		}
		return value;
	}

	set_value(_value)
	{
		if (typeof _value == 'string' || typeof _value == 'number')
		{
			if (typeof _value == 'string' && _value.indexOf(",") > 0) _value = _value.replace(",", ":");
			if (typeof _value == 'string' && _value.indexOf(":") >= 0)
			{
				var split = _value.split(":");

				_value = {
					app: split.shift(),
					id: split.length == 1 ? split[0] : split
				};
			}
			else if (_value && this.options.only_app)
			{
				_value = {
					app: this.options.only_app,
					id: _value
				};
			}
		}
		// display a search query, not a selected entry
		else if (_value !== null && typeof _value === 'object' && typeof _value.query === 'string')
		{
			this.options.value = { app: _value.app || this.options.only_app, id: null };
			this.search.val(_value.query);
			return;
		}
		this._oldValue = this.options.value;
		if (!_value || _value.length == 0 || _value == null || jQuery.isEmptyObject(_value))
		{
			this.search.val("");
			this.clear.hide();
			this.options.value = _value = {'id': null};
		}
		if (!_value.app) _value.app = this.options.only_app || this.app_select.val();

		if (_value.id)
		{
			// Remove specific display and revert to CSS file
			// show() would use inline, should be inline-block
			this.clear.css('display', '');
		}
		else
		{
			this.clear.hide();
			return;
		}
		if (typeof _value != 'object' || (!_value.app && !_value.id))
		{
			console.warn("Bad value for link widget.  Need an object with keys 'app', 'id', and optionally 'title'", _value);
			return;
		}
		if (!_value.title)
		{
			var title = this.egw().link_title(_value.app, _value.id);
			if (title != null)
			{
				_value.title = title;
			}
			else
			{
				// Title will be fetched from server and then set
				var title = this.egw().link_title(_value.app, _value.id, function (title)
				{
					this.search.removeClass("loading").val(title + "");
					// Remove specific display and revert to CSS file
					// show() would use inline, should be inline-block
					this.clear.css('display', '');
				}, this);
				this.search.addClass("loading");
			}
		}
		if (_value.title)
		{
			this.search.val(_value.title + "");
		}
		this.options.value = _value;

		jQuery("option[value='" + _value.app + "']", this.app_select).prop("selected", true);
		this.app_select.hide();
		if (this.options.app_icons && this.app_select.iconselectmenu('instance'))
		{
			this.app_select.iconselectmenu('widget').hide();
		}
		this.div.addClass("no_app");
	}

	set_blur(_value, input)
	{

		if (typeof input == 'undefined') input = this.search;

		if (_value)
		{
			input.attr("placeholder", _value);	// HTML5
			if (!input[0].placeholder)
			{
				// Not HTML5
				if (input.val() == "") input.val(_value);
				input.focus(input, function (e)
				{
					var placeholder = _value;
					if (e.data.val() == placeholder) e.data.val("");
				}).blur(input, function (e)
				{
					var placeholder = _value;
					if (e.data.val() == "") e.data.val(placeholder);
				});
				if (input.val() == "")
				{
					input.val(_value);
				}
			}
		}
		else
		{
			this.search.removeAttr("placeholder");
		}
	}

	/**
	 * Set the query callback
	 *
	 * @param {function} f
	 */
	set_query(f)
	{
		this.options.query = f;
	}

	/**
	 * Set the select callback
	 *
	 * @param {function} f
	 */
	set_select(f)
	{
		this.options.select = f;
	}

	/**
	 * Ask server for entries matching selected app/type and filtered by search string
	 *
	 * @param {Object} request
	 * @param {Object} response
	 */
	query(request, response)
	{
		// If there is a pending request, abort it
		if (this.request)
		{
			this.request.abort();
			this.request = null;
		}

		// Remember last search
		this.last_search = this.search.val();

		// Allow hook / tie in
		if (this.options.query && typeof this.options.query == 'function')
		{
			if (!this.options.query(request, this)) return false;
		}

		if ((typeof request.no_cache == 'undefined' && !request.no_cache) && request.term in this.cache)
		{
			return response(this.cache[request.term]);
		}

		this.search.addClass("loading");
		// Remove specific display and revert to CSS file
		// show() would use inline, should be inline-block
		this.clear.css('display', '');

		this.request = egw.request("EGroupware\\Api\\Etemplate\\Widget\\Link::ajax_link_search",
			[this.app_select.val(), '', request.term, request.options]);

		this.request.then((data) =>
		{
			if (this.request)
			{
				this.request = null;
			}
			this.search.removeClass("loading");
			let result = [];
			for (var id in data)
			{
				result.push({"value": id, "label": data[id]});
			}
			this.cache[this.search.val()] = result;
			response(result);
		});
	}

	/**
	 * User selected a value
	 *
	 * @param {Object} event
	 * @param {Object} selected
	 *
	 */
	select(event, selected)
	{
		if (selected.item.value !== null && typeof selected.item.value == "string")
		{
			// Correct changed value from server
			selected.item.value = selected.item.value.trim();
		}
		if (this.options.select && typeof this.options.select == 'function')
		{
			if (!this.options.select(event, selected)) return false;
		}
		if (typeof event.data.options.value != 'object' || event.data.options.value == null)
		{
			event.data.options.value = {};
		}
		event.data.options.value.id = selected.item.value;

		// Set a processing flag to filter some events
		event.data.processing = true;

		// Remove specific display and revert to CSS file
		// show() would use inline, should be inline-block
		this.clear.css('display', '');
		event.data.search.val(selected.item.label);

		// Fire change event
		this.search.change();

		// Turn off processing flag when done
		window.setTimeout(jQuery.proxy(function ()
		{
			delete this.processing;
		}, event.data));
	}

	/**
	 * Create a link using the current internal values
	 *
	 * @param {Object} event
	 * @param {Object} _links
	 */
	createLink(event, _links)
	{

		var values = event.data.options.value;
		var self = event.data;
		var links = [];

		if (typeof _links == 'undefined')
		{
			links = [];
		}
		else
		{
			links = _links;
		}

		// Links to other entries
		if (values.id)
		{
			links.push({
				app: values.app,
				id: values.id
			});
			self.search.val("");
		}

		// If a link array was passed in, don't make the ajax call
		if (typeof _links == 'undefined')
		{
			var request = egw.json("EGroupware\\Api\\Etemplate\\Widget\\Link::ajax_link",
				[values.to_app, values.to_id, links],
				self._link_result,
				this,
				true
			);
			request.sendRequest();
		}
	}

	/**
	 * Sent some links, server has a result
	 *
	 * @param {Object} success
	 *
	 */
	_link_result(success)
	{
		if (success)
		{
			this.status_span.fadeIn().delay(1000).fadeOut();
			delete this.options.value.app;
			delete this.options.value.id;
		}
	}
}

et2_register_widget(et2_link_entry, ["link-entry"]);

/**
 * UI widget for a single (read-only) link
 *
 */
export class et2_link extends et2_valueWidget implements et2_IDetachedDOM
{
	static readonly _attributes: any = {
		"only_app": {
			"name": "Application",
			"type": "string",
			"default": "",
			"description": "Use the given application, so you can pass just the ID for value"
		},
		"value": {
			description: "Array with keys app, id, and optionally title",
			type: "any"
		},
		"needed": {
			"ignore": true
		},
		"link_hook": {
			"name": "Type",
			"type": "string",
			"default": "view",
			"description": "Hook used for displaying link (view/edit/add)"
		},
		"target_app": {
			"name": "Target application",
			"type": "string",
			"default": "",
			"description": "Optional parameter to be passed to egw().open in order to open links in specified application"
		},
		"extra_link_target": {
			"name": "Link target",
			"type": "string",
			"default": null,
			"description": "Optional parameter to be passed to egw().open in order to open links in specified target eg. _blank"
		},
		"break_title": {
			"name": "break title",
			"type": "string",
			"default": null,
			"description": "Breaks title into multiple lines based on selected delimiter by replacing it with '\r\n'"
		}
	};
	public static readonly legacyOptions = ["only_app"];

	private label_span: JQuery;
	private link: JQuery;

	/**
	 * Constructor
	 *
	 * @memberOf et2_link
	 */
	constructor(_parent: et2_widget, _attrs?: WidgetConfig, _child?: object)
	{
		super(_parent, _attrs, ClassWithAttributes.extendAttributes(et2_link._attributes, _child || {}));


		this.label_span = jQuery(document.createElement("label"))
			.addClass("et2_label");
		this.link = jQuery(document.createElement("span"))
			.addClass("et2_link")
			.appendTo(this.label_span);

		if (this.options['class']) this.label_span.addClass(this.options['class']);
		this.setDOMNode(this.label_span[0]);
	}

	destroy()
	{
		if (this.link) this.link.unbind();
		this.link = null;
		super.destroy.apply(this, arguments);
	}

	set_label(label)
	{
		// Remove current label
		this.label_span.contents()
			.filter(function ()
			{
				return this.nodeType == 3;
			}).remove();

		var parts = et2_csvSplit(label, 2, "%s");
		this.label_span.prepend(parts[0]);
		this.label_span.append(parts[1]);
		this.label = label;

		// add class if label is empty
		this.label_span.toggleClass('et2_label_empty', !label || !parts[0]);
	}

	set_value(_value)
	{
		if (typeof _value != 'object' && _value && !this.options.only_app)
		{
			if (_value.indexOf(':') >= 0)
			{
				var app = _value.split(':', 1);
				var id = _value.substr(app[0].length + 1);
				_value = {'app': app[0], 'id': id};
			}
			else
			{
				console.warn("Bad value for link widget.  Need an object with keys 'app', 'id', and optionally 'title'", _value);
				return;
			}
		}
		// Application set, just passed ID
		else if (typeof _value != "object")
		{
			_value = {
				app: this.options.only_app,
				id: _value
			};
		}
		if (!_value || jQuery.isEmptyObject(_value))
		{
			this.link.text("").unbind();
			return;
		}
		var self = this;
		this.link.unbind();
		if (_value.id && _value.app)
		{
			this.link.addClass("et2_link");
			this.link.click(function (e)
			{
				// try to fetch value.title if it wasn't fetched during initiation.
				if (!_value.title) _value.title = self.egw().link_title(_value.app, _value.id);
				if (!self.options.target_app)
				{
					self.options.target_app = _value.app;
				}
				const target = self.options.extra_link_target || _value.app;
				self.egw().open(_value, "", self.options.link_hook, _value.extra_args, target, self.options.target_app);
				e.stopImmediatePropagation();
			});
		}
		else
		{
			this.link.removeClass("et2_link");
		}
		if (!_value.title)
		{
			var self = this;
			var node = this.link[0];
			if (_value.app && _value.id)
			{
				var title = this.egw().link_title(_value.app, _value.id, function (title)
				{
					self.set_title(node, title);
				}, this);
				if (title != null)
				{
					_value.title = title;
				}
				else
				{
					// Title will be fetched from server and then set
					return;
				}
			}
			else
			{
				_value.title = "";
			}
		}
		this.set_title(this.link, _value.title);
	}

	/**
	 * Sets the text to be displayed.
	 * Used as a callback, so node is provided to make sure we get the right one
	 *
	 * @param {Object} node
	 * @param {String} _value description
	 */
	set_title(node, _value)
	{
		if (_value === false || _value === null) _value = "";

		if (this.options.break_title)
		{
			// Set up title to optionally break on the provided character - replace all space with nbsp, add a
			// zero-width space after the break string
			_value = _value
				.replace(this.options.break_title, this.options.break_title.trimEnd() + "\u200B")
				.replace(/ /g, '\u00a0');
		}
		jQuery(node).text(_value + "");
	}

	/**
	 * Creates a list of attributes which can be set when working in the
	 * "detached" mode. The result is stored in the _attrs array which is provided
	 * by the calling code.
	 *
	 * @param {Array} _attrs an array of attributes
	 */
	getDetachedAttributes(_attrs)
	{
		_attrs.push("label", "value");
	}

	/**
	 * Returns an array of DOM nodes. The (relatively) same DOM-Nodes have to be
	 * passed to the "setDetachedAttributes" function in the same order.
	 */
	getDetachedNodes()
	{
		return [this.node, this.link[0]];
	}

	/**
	 * Sets the given associative attribute->value array and applies the
	 * attributes to the given DOM-Node.
	 *
	 * @param _nodes is an array of nodes which have to be in the same order as
	 *      the nodes returned by "getDetachedNodes"
	 * @param _values is an associative array which contains a subset of attributes
	 *      returned by the "getDetachedAttributes" function and sets them to the
	 *      given values.
	 */
	setDetachedAttributes(_nodes, _values)
	{
		this.node = _nodes[0];
		this.label_span = jQuery(_nodes[0]);
		this.link = jQuery(_nodes[1]);
		if (typeof _values["id"] !== "undefined") this.set_id(_values['id']);
		if (typeof _values["label"] !== "undefined") this.set_label(_values['label']);
		if (typeof _values["value"] !== "undefined") this.set_value(_values["value"]);
	}

}

et2_register_widget(et2_link, ["link", "link-entry_ro"]);

/**
 * UI widget for one or more links, comma separated
 *
 * TODO: This one used to have expose
 */
export class et2_link_string extends expose(class et2_link_string extends et2_valueWidget implements et2_IDetachedDOM, et2_IExposable
{
	static readonly _attributes: any = {
		"application": {
			"name": "Application",
			"type": "string",
			"default": "",
			"description": "Use the given application, so you can pass just the ID for value"
		},
		"value": {
			"description": "Either an array of link information (see egw_link::link()) or array with keys to_app and to_id",
			"type": "any"
		},
		"only_app": {
			"name": "Application filter",
			"type": "string",
			"default": "",
			"description": "Appname, eg. 'projectmananager' to list only linked projects"
		},
		"link_type": {
			"name": "Type filter",
			"type": "string",
			"default": "",
			"description": "Sub-type key to list only entries of that type"
		},
		"expose_view": {
			name: "Expose view",
			type: "boolean",
			default: true,
			description: "Clicking on description with href value would popup an expose view, and will show content referenced by href."
		}
	};
	protected list: JQuery;
	protected value: any;

	/**
	 * Constructor
	 *
	 * @memberOf et2_link_string
	 */
	constructor(_parent: et2_widget, _attrs?: WidgetConfig, _child?: object)
	{
		super(_parent, _attrs, ClassWithAttributes.extendAttributes(et2_link_string._attributes, _child || {}));


		this.list = jQuery(document.createElement("ul"))
			.addClass("et2_link_string");

		if (this.options['class']) this.list.addClass(this.options['class']);
		this.setDOMNode(this.list[0]);
	}

	destroy()
	{
		super.destroy.apply(this, arguments);
		if (this.node != null)
		{
			jQuery(this.node).children().unbind();
		}
	}

	set_value(_value)
	{
		// Get data
		if (!_value || _value == null || !this.list)
		{
			// List can be missing if the AJAX call returns after the form is destroyed
			if (this.list)
			{
				this.list.empty();
			}
			return;
		}
		if (typeof _value == "string" && _value.indexOf(',') > 0)
		{
			_value = _value.split(',');
		}
		if (!_value.to_app && typeof _value == "object" && this.options.application)
		{
			_value.to_app = this.options.application;
		}

		if (typeof _value == 'object' && _value.to_app && _value.to_id)
		{
			this.value = _value;
			this._get_links();
			return;
		}
		this.list.empty();
		if (typeof _value == 'object' && _value.length > 0)
		{
			// Have full info
			// Don't store new value, just update display


			// Make new links
			for (var i = 0; i < _value.length; i++)
			{
				if (!this.options.only_app || this.options.only_app && _value[i].app == this.options.only_app)
				{
					this._add_link(_value[i].id ? _value[i] : {id: _value[i], app: _value.to_app});
				}
			}
		}
		else if (this.options.application)
		{
			this._add_link({id: _value, app: this.options.application});
		}
	}

	_get_links()
	{
		var _value = this.value;
		// Just IDs - get from server
		if (this.options.only_app)
		{
			_value.only_app = this.options.only_app;
		}
		this.egw().jsonq('EGroupware\\Api\\Etemplate\\Widget\\Link::ajax_link_list', [_value], this.set_value, this);
		return;
	}

	/**
	 * Function to get media content to feed the expose
	 * @param {type} _value
	 * @returns {Array|Array.getMedia.mediaContent}
	 */
	getMedia(_value)
	{
		let base_url = egw.webserverUrl.match(/^\//, 'ig') ? egw(window).window.location.origin + egw.webserverUrl : egw.webserverUrl;
		let mediaContent = [];
		if (_value && typeof _value.type != 'undefined' && _value.type.match(/video\/|audio\//, 'ig'))
		{
			mediaContent = [{
				title: _value.id,
				type: _value.type,
				poster: '', // TODO: Should be changed by correct video thumbnail later
				href: base_url + egw().mime_open(_value),
				download_href: base_url + egw().mime_open(_value) + '?download'
			}];
		}
		else if (_value)
		{
			mediaContent = [{
				title: _value.id,
				href: base_url + egw().mime_open(_value).url,
				download_href: base_url + egw().mime_open(_value).url + '?download',
				type: _value.type
			}];
		}
		if (mediaContent[0].href && mediaContent[0].href.match(/\/webdav.php/, 'ig')) mediaContent[0]["download_href"] = mediaContent[0].href + '?download';
		return mediaContent;
	}

	_add_link(_link_data)
	{
		var self = this;
		var link = jQuery(document.createElement("li"))
			.appendTo(this.list)
			.addClass("et2_link loading")
			.click(function (e)
			{
				var fe = egw_get_file_editor_prefered_mimes(_link_data.type);
				if (self.options.expose_view && typeof _link_data.type != 'undefined'
					&& _link_data.type.match(self.mime_regexp, 'ig') && !_link_data.type.match(self.mime_audio_regexp, 'ig'))
				{
					self._init_blueimp_gallery(e, _link_data);
				}
				else if (_link_data.type && _link_data.type.match(self.mime_audio_regexp, 'ig'))
				{
					self._audio_player(_link_data);
				}
				else if (typeof _link_data.type != 'undefined' && fe && fe.mime && fe.mime[_link_data.type])
				{
					egw.open_link(egw.link('/index.php', {
						menuaction: fe.edit.menuaction,
						path: egw().mime_open(_link_data).url.replace('/webdav.php', '')
					}), '', fe.edit_popup);
				}
				else
				{
					self.egw().open(_link_data, "", "view", null, _link_data.app, _link_data.app);
				}
				e.stopImmediatePropagation();
			});

		if (_link_data.title)
		{
			link.text(_link_data.title)
				.removeClass("loading");
		}
		// Now that link is created, get title from server & update
		else
		{
			this.egw().link_title(_link_data.app, _link_data.id, function (title)
			{
				if (title)
					this.removeClass("loading").text(title);
				else
					this.remove();	// no rights or not found
			}, link);
		}
	}

	/**
	 * Creates a list of attributes which can be set when working in the
	 * "detached" mode. The result is stored in the _attrs array which is provided
	 * by the calling code.
	 *
	 * @param {Array} _attrs an array of attributes
	 */
	getDetachedAttributes(_attrs)
	{
		// Create the label container if it didn't exist yet
		if (this._labelContainer == null)
		{
			this._labelContainer = jQuery(document.createElement("label"))
				.addClass("et2_label");
			this.getSurroundings().insertDOMNode(this._labelContainer[0]);
			this.getSurroundings().update();
		}
		_attrs.push("value", "label");
	}

	/**
	 * Returns an array of DOM nodes. The (relatively) same DOM-Nodes have to be
	 * passed to the "setDetachedAttributes" function in the same order.
	 */
	getDetachedNodes()
	{
		// Create the label container if it didn't exist yet
		if (this._labelContainer == null)
		{
			this._labelContainer = jQuery(document.createElement("label"))
				.addClass("et2_label");
			this.getSurroundings().insertDOMNode(this._labelContainer[0]);
		}
		return [this.list[0], this._labelContainer[0]];
	}

	/**
	 * Sets the given associative attribute->value array and applies the
	 * attributes to the given DOM-Node.
	 *
	 * @param _nodes is an array of nodes which have to be in the same order as
	 *      the nodes returned by "getDetachedNodes"
	 * @param _values is an associative array which contains a subset of attributes
	 *      returned by the "getDetachedAttributes" function and sets them to the
	 *      given values.
	 */
	setDetachedAttributes(_nodes, _values)
	{
		this.list = jQuery(_nodes[0]);

		this.set_value(_values["value"]);

		// Special detached, to prevent DOM node modification of the normal method
		this._labelContainer = _nodes.length > 1 ? jQuery(_nodes[1]) : null;
		if (_values['label'])
		{
			this.set_label(_values['label']);
		}
		else if (this._labelContainer)
		{
			this._labelContainer.contents().not(this.list).remove();
		}
	}
})
{
};
et2_register_widget(et2_link_string, ["link-string"]);

/**
 * UI widget for one or more links in a list (table)
 */
export class et2_link_list extends et2_link_string
{
	static readonly _attributes: any = {
		"show_deleted": {
			"name": "Show deleted",
			"type": "boolean",
			"default": false,
			"description": "Show links that are marked as deleted, being held for purge"
		},
		"onchange": {
			"name": "onchange",
			"type": "js",
			"default": et2_no_init,
			"description": "JS code which is executed when the links change."
		},
		readonly: {
			name: "readonly",
			type: "boolean",
			"default": false,
			description: "Does NOT allow user to enter data, just displays existing data"
		},
		"target_app": {
			"name": "Target application",
			"type": "string",
			"default": "",
			"description": "Optional parameter to be passed to egw().open in order to open links in specified application "
		}
	};
	private context: egwMenu;

	/**
	 * Constructor
	 *
	 */
	constructor(_parent: et2_widget, _attrs?: WidgetConfig, _child?: object)
	{
		super(_parent, _attrs, ClassWithAttributes.extendAttributes(et2_link_list._attributes, _child || {}));


		this.list = jQuery(document.createElement("table"))
			.addClass("et2_link_list");
		if (this.options['class']) this.list.addClass(this.options['class']);
		this.setDOMNode(this.list[0]);

		// Set up context menu
		var self = this;
		this.context = new egwMenu();
		this.context.addItem("comment", this.egw().lang("Comment"), "", function ()
		{
			var link_id = typeof self.context.data.link_id == 'number' ? self.context.data.link_id : self.context.data.link_id.replace(/[:\.]/g, '_');

			et2_dialog.show_prompt(
				function (button, comment)
				{
					if (button != et2_dialog.OK_BUTTON) return;
					var remark = jQuery('#link_' + (self.context.data.dom_id ? self.context.data.dom_id : link_id), self.list).children('.remark');
					if (isNaN(self.context.data.link_id))	// new entry, not yet stored
					{
						remark.text(comment);
						// Look for a link-to with the same ID, refresh it
						if (self.context.data.link_id)
						{
							var _widget = link_id.widget || null;
							self.getRoot().iterateOver(
								function (widget)
								{
									if (widget.id == self.id)
									{
										_widget = widget;
									}
								},
								self, et2_link_to
							);
							var value = _widget != null ? _widget.getValue() : false;
							if (_widget && value && value.to_id)
							{
								value.to_id[self.context.data.link_id].remark = comment;
							}
						}
						return;
					}
					remark.addClass("loading");
					var request = egw.json("EGroupware\\Api\\Etemplate\\Widget\\Link::ajax_link_comment",
						[link_id, comment],
						function ()
						{
							if (remark)
							{
								// Append "" to make sure it's a string, not undefined
								remark.removeClass("loading").text(comment + "");
								// Update internal data
								self.context.data.remark = comment + "";
							}
						},
						this, true
					).sendRequest();
				},
				'', self.egw().lang("Comment"), self.context.data.remark || ''
			);

		});
		this.context.addItem("file_info", this.egw().lang("File information"), this.egw().image("edit"), function (menu_item)
		{
			var link_data = self.context.data;
			if (link_data.app == 'file')
			{
				// File info is always the same
				var url = '/apps/' + link_data.app2 + '/' + link_data.id2 + '/' + decodeURIComponent(link_data.id);
				if (typeof url == 'string' && url.indexOf('webdav.php'))
				{
					// URL is url to file in webdav, so get rid of that part
					url = url.replace('/webdav.php', '');
				}
				self.egw().open(url, "filemanager", "edit");
			}
		});
		this.context.addItem("-", "-");
		this.context.addItem("save", this.egw().lang("Save as"), this.egw().image('save'), function (menu_item)
		{
			var link_data = self.context.data;
			// Download file
			if (link_data.download_url)
			{
				var url = link_data.download_url;
				if (url[0] == '/') url = egw.link(url);

				let a = document.createElement('a');
				if (typeof a.download == "undefined")
				{
					window.location.href = url + "?download";
					return false;
				}

				// Multiple file download for those that support it
				a = jQuery(a)
					.prop('href', url)
					.prop('download', link_data.title || "")
					.appendTo(self.getInstanceManager().DOMContainer);

				var evt = document.createEvent('MouseEvent');
				evt.initMouseEvent('click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
				a[0].dispatchEvent(evt);
				a.remove();
				return false;
			}

			self.egw().open(link_data, "", "view", 'download', link_data.target ? link_data.target : link_data.app, link_data.app);
		});
		this.context.addItem("zip", this.egw().lang("Save as Zip"), this.egw().image('save_zip'), function (menu_item)
		{
			// Highlight files for nice UI indicating what will be in the zip.
			// Files have negative IDs.
			jQuery('[id^="link_-"]', this.list).effect('highlight', {}, 2000);

			// Download ZIP
			window.location = self.egw().link('/index.php', {
				menuaction: 'api.EGroupware\\Api\\Etemplate\\Widget\\Link.download_zip',
				app: self.value.to_app,
				id: self.value.to_id
			});
		});

		// Only allow this option if the entry has been saved, and has a real ID
		if (self.options.value && self.options.value.to_id && typeof self.options.value.to_id != 'object')
		{
			this.context.addItem("copy_to", this.egw().lang("Copy to"), this.egw().image('copy'), function (menu_item)
			{
				// Highlight files for nice UI indicating what will be copied
				jQuery('[id="link_' + self.context.data.link_id + ']', this.list).effect('highlight', {}, 2000);

				// Get target
				var select_attrs: any = {
					mode: "select-dir",
					button_caption: '',
					button_icon: 'copy',
					button_label: egw.lang("copy"),
					//extra_buttons: [{text: egw.lang("link"),	id:"link", image: "link"}],
					dialog_title: egw.lang('Copy to'),
					method: "EGroupware\\Api\\Etemplate\\Widget\\Link::ajax_copy_to",
					method_id: self.context.data
				};
				let vfs_select = <et2_vfsSelect>et2_createWidget("vfs-select", select_attrs, self);

				// No button, just open it
				vfs_select.button.hide();
				vfs_select.click(null);
			});
		}
		this.context.addItem("-", "-");
		this.context.addItem("delete", this.egw().lang("Delete link"), this.egw().image("delete"), function (menu_item)
		{
			var link_id = isNaN(self.context.data.link_id) ? self.context.data : self.context.data.link_id;
			var row = jQuery('#link_' + (self.context.data.dom_id ? self.context.data.dom_id : self.context.data.link_id), self.list);
			et2_dialog.show_dialog(
				function (button)
				{
					if (button == et2_dialog.YES_BUTTON) self._delete_link(link_id, row);
				},
				egw.lang('Delete link?')
			);
		});

		// Native DnD - Doesn't play nice with jQueryUI Sortable
		// Tell jQuery to include this property
		jQuery.event.props.push('dataTransfer');

	}

	destroy()
	{
		super.destroy.apply(this, arguments);
		if (this.context)
		{
			this.context.clear();
			delete this.context;
		}
	}

	set_value(_value)
	{
		this.list.empty();
		// Handle server passed a list of links that aren't ready yet
		if (_value && typeof _value == "object")
		{
			var list = [];
			if (_value.to_id && typeof _value.to_id == "object")
			{
				list = _value.to_id;
			}
			else if (_value.length)
			{
				list = _value;
			}
			if (list.length > 0)
			{
				for (var id in list)
				{
					var link = list[id];
					if (link.app)
					{
						// Temp IDs can cause problems since the ID includes the file name or :
						if (link.link_id && typeof link.link_id != 'number')
						{
							link.dom_id = 'temp_' + egw.uid();
						}
						// Icon should be in registry
						if (!link.icon)
						{
							link.icon = egw.link_get_registry(link.app, 'icon');
							// No icon, try by mime type - different place for un-saved entries
							if (link.icon == false && link.id.type)
							{
								// Triggers icon by mime type, not thumbnail or app
								link.type = link.id.type;
								link.icon = true;
							}
						}
						// Special handling for file - if not existing, we can't ask for title
						if (typeof link.id == 'object' && !link.title)
						{
							link.title = link.id.name || '';
						}
						this._add_link(link);
					}
				}
			}
			else
			{
				super.set_value(_value);
			}
		}
	}

	_add_link(_link_data)
	{
		var row = jQuery(document.createElement("tr"))
			.attr("id", "link_" + (_link_data.dom_id ? _link_data.dom_id : (typeof _link_data.link_id == "string" ? _link_data.link_id.replace(/[:\.]/g, '_') : _link_data.link_id || _link_data.id)))
			.attr("draggable", _link_data.app == 'file' ? "true" : "")
			.appendTo(this.list);
		if (!_link_data.link_id)
		{
			for (var k in _link_data)
			{
				row[0].dataset[k] = _link_data[k];
			}
		}

		// Icon
		var icon = jQuery(document.createElement("td"))
			.appendTo(row)
			.addClass("icon");
		if (_link_data.icon)
		{
			var icon_widget = et2_createWidget("image", {});
			var src = '';
			// Creat a mime widget if the link has type
			if (_link_data.type)
			{
				// VFS - file
				var vfs_widget = et2_createWidget('vfs-mime', {});
				vfs_widget.set_value({
					download_url: _link_data.download_url,
					name: _link_data.title,
					mime: _link_data.type,
					path: _link_data.icon
				});
				icon.append(vfs_widget.getDOMNode());
			}
			else
			{
				src = this.egw().image(_link_data.icon);
				if (src) icon_widget.set_src(src);
				icon.append(icon_widget.getDOMNode());
			}
		}

		var columns = ['title', 'remark'];

		var self = this;
		for (var i = 0; i < columns.length; i++)
		{
			var $td = jQuery(document.createElement("td"))
				.appendTo(row)
				.addClass(columns[i])
				.text(_link_data[columns[i]] ? _link_data[columns[i]] + "" : "");

			var dirs = _link_data[columns[i]] ? _link_data[columns[i]].split('/') : [];
			if (columns[i] == 'title' && _link_data.type && dirs.length > 1)
			{
				this._format_vfs($td, dirs, _link_data);
			}
			//Bind the click handler if there is download_url
			if (_link_data && (typeof _link_data.download_url != 'undefined' || _link_data.app != 'egw-data'))
			{
				$td.click(function ()
				{
					var fe_mime = egw_get_file_editor_prefered_mimes(_link_data.type);
					// Check if the link entry is mime with media type, in order to open it in expose view
					if (typeof _link_data.type != 'undefined' &&
						(_link_data.type.match(self.mime_regexp, 'ig') || (fe_mime && fe_mime.mime[_link_data.type])))
					{
						var $vfs_img_node = jQuery(this).parent().find('.vfsMimeIcon');
						if ($vfs_img_node.length > 0) $vfs_img_node.click();
					}
					else
					{
						if (!self.options.target_app)
						{
							self.options.target_app = _link_data.app;
						}
						self.egw().open(_link_data, "", "view", null, _link_data.target ? _link_data.target : _link_data.app, self.options.target_app);
					}
				});
			}
		}

		if (typeof _link_data.title == 'undefined')
		{
			// Title will be fetched from server and then set
			jQuery('td.title', row).addClass("loading");
			var title = this.egw().link_title(_link_data.app, _link_data.id, function (title)
			{
				jQuery('td.title', this).removeClass("loading").text(title + "");
			}, row);
		}
		// Date
		/*
		var date_row = jQuery(document.createElement("td"))
			.appendTo(row);
		if(_link_data.lastmod)
		{
			var date_widget = et2_createWidget("date-since");
			date_widget.set_value(_link_data.lastmod);
			date_row.append(date_widget.getDOMNode());
		}
		*/

		// Delete
		// build delete button if the link is not readonly
		if (!this.options.readonly)
		{
			var delete_button = jQuery(document.createElement("td"))
				.appendTo(row);
			jQuery("<div />")
				.appendTo(delete_button)
				// We don't use ui-icon because it assigns a bg image
				.addClass("delete icon")
				.bind('click', function ()
				{
					et2_dialog.show_dialog(
						function (button)
						{
							if (button == et2_dialog.YES_BUTTON)
							{
								self._delete_link(
									self.value && typeof self.value.to_id != 'object' && _link_data.link_id ? _link_data.link_id : _link_data,
									row
								);
							}
						},
						egw.lang('Delete link?')
					);
				});
		}
		// Context menu
		row.bind("contextmenu", function (e)
		{
			// Comment only available if link_id is there and not readonly
			self.context.getItem("comment").set_enabled(typeof _link_data.link_id != 'undefined' && !self.options.readonly);
			// File info only available for existing files
			self.context.getItem("file_info").set_enabled(typeof _link_data.id != 'object' && _link_data.app == 'file');
			self.context.getItem("save").set_enabled(typeof _link_data.id != 'object' && _link_data.app == 'file');
			// Zip download only offered if there are at least 2 files
			self.context.getItem("zip").set_enabled(jQuery('[id^="link_-"]', this.list).length >= 2);
			// Show delete item only if the widget is not readonly
			self.context.getItem("delete").set_enabled(!self.options.readonly);

			self.context.data = _link_data;
			self.context.showAt(e.pageX, e.pageY, true);
			e.preventDefault();
		});


		// Drag - adapted from egw_action_dragdrop, sidestepping action system
		// so all linked files get it
		// // Unfortunately, dragging files is currently only supported by Chrome
		if (navigator && navigator.userAgent.indexOf('Chrome') >= 0)
		{
			row.on("dragstart", _link_data, function (event)
			{
				if (event.dataTransfer == null)
				{
					return;
				}
				var data = event.data || {};
				if (data && data.type && data.download_url)
				{
					event.dataTransfer.dropEffect = "copy";
					event.dataTransfer.effectAllowed = "copy";

					var url = data.download_url;

					// NEED an absolute URL
					if (url[0] == '/') url = egw.link(url);
					// egw.link adds the webserver, but that might not be an absolute URL - try again
					if (url[0] == '/') url = window.location.origin + url;

					// Unfortunately, dragging files is currently only supported by Chrome
					if (navigator && navigator.userAgent.indexOf('Chrome'))
					{
						event.dataTransfer.setData("DownloadURL", data.type + ':' + data.title + ':' + url);
					}

					// Include URL as a fallback
					event.dataTransfer.setData("text/uri-list", url);
				}

				if (event.dataTransfer.types.length == 0)
				{
					// No file data? Abort: drag does nothing
					event.preventDefault();
					return;
				}
				//event.dataTransfer.setDragImage(event.delegate.target,0,0);
				var div = jQuery(document.createElement("div"))
					.attr('id', 'drag_helper')
					.css({
						position: 'absolute',
						top: '0px',
						left: '0px',
						width: '300px'
					});
				div.append(event.target.cloneNode(true));

				self.list.append(div);

				event.dataTransfer.setDragImage(div.get(0), 0, 0);
			})
				.on('drag', function ()
				{
					jQuery('#drag_helper', self.list).remove();
				});
		}
	}

	_delete_link(link_id, row)
	{
		if (row)
		{
			var delete_button = jQuery('.delete', row);
			delete_button.removeClass("delete").addClass("loading");
			row.off();
		}
		if (this.onchange)
		{
			this.onchange(this, link_id, row);
		}
		if (typeof link_id != "object")
		{
			egw.json("EGroupware\\Api\\Etemplate\\Widget\\Link::ajax_delete", [link_id],
				function (data)
				{
					if (data)
					{
						row.slideUp(row.remove);
					}
				}
			).sendRequest();
		}
		else if (row)
		{
			// No link ID means a link on an unsaved entry.
			// Just remove the row, but need to adjust the link_to value also
			row.slideUp(row.remove);

			// Look for a link-to with the same ID, refresh it
			if (link_id.link_id)
			{
				var self = this;
				var _widget = link_id.widget || null;
				this.getRoot().iterateOver(
					function (widget)
					{
						if (widget.id == self.id)
						{
							_widget = widget;
						}
					},
					this, et2_link_to
				);
				var value = _widget != null ? _widget.getValue() : false;
				if (_widget && value && value.to_id)
				{
					delete value.to_id[link_id.link_id];
					_widget.set_value(value);
				}
			}
		}
	}

	/**
	 * When the link is to a VFS file, we do some special formatting.
	 *
	 * Instead of listing the full path, we use
	 *	Path: - filename
	 * When multiple files from the same directory are linked, we exclude
	 * the directory name from all but the first link to that directory
	 *
	 * @param {JQuery} $td Current table data cell for the title
	 * @param {String[]} dirs List of directories in the linked file's path
	 * @param {String[]} _link_data Data for the egw_link
	 * @returns {undefined}
	 */
	_format_vfs($td, dirs, _link_data)
	{
		// Keep it here for matching next row
		$td.attr('data-title', _link_data['title']);

		// VFS link - check for same dir as above, and hide dir
		var reformat = false;
		var span_size = 1;
		var prev = jQuery('td.title', $td.parent().prev('tr'));
		if (prev.length === 1)
		{
			var prev_dirs = (prev.attr('data-title') || '').split('/');
			if (prev_dirs.length > 1 && prev_dirs.length == dirs.length)
			{
				for (var i = 0; i < dirs.length; i++)
				{
					// Current is same as prev, blank it
					if (dirs[i] === prev_dirs[i])
					{
						reformat = true;
						span_size += dirs[i].length + 1;
						dirs[i] = '';
					}
					else
					{
						break;
					}
				}
			}
		}
		var filename = dirs.pop();
		if (reformat && (dirs.length - i) === 0)
		{
			$td.html('<span style="display: inline-block; width:' + span_size + 'ex;"></span> - ' + filename);
		}
		else
		{
			// Different format for directory
			span_size += dirs.join('/').length + 1;
			$td.html('<span style="display: inline-block; text-align: right; width:' + span_size + 'ex;">' + dirs.join('/') + ':</span> - ' + filename);
		}
	}
}

et2_register_widget(et2_link_list, ["link-list"]);


/**
 *
 *
 */
export class et2_link_add extends et2_inputWidget
{
	static readonly _attributes: any = {
		"value": {
			"description": "Either an array of link information (see egw_link::link()) or array with keys to_app and to_id",
			"type": "any"
		},
		"application": {
			"name": "Application",
			"type": "string",
			"default": "",
			"description": "Limit to the listed application or applications (comma seperated)"
		}
	};
	private span: JQuery;
	private div: JQuery;
	private app_select: et2_link_apps;
	private button: et2_button;

	/**
	 * Constructor
	 */
	constructor(_parent: et2_widget, _attrs?: WidgetConfig, _child?: object)
	{
		super(_parent, _attrs, ClassWithAttributes.extendAttributes(et2_link_add._attributes, _child || {}));


		this.span = jQuery(document.createElement("span"))
			.text(this.egw().lang("Add new"))
			.addClass('et2_link_add_span');
		this.div = jQuery(document.createElement("div")).append(this.span);
		this.setDOMNode(this.div[0]);
	}

	doLoadingFinished()
	{
		super.doLoadingFinished.apply(this, arguments);
		if (this.app_select && this.button)
		{
			// Already done
			return false;
		}
		this.app_select = <et2_link_apps>et2_createWidget("link-apps", jQuery.extend({}, this.options, {
			'id': this.options.id + 'app',
			value: this.options.application ? this.options.application : this.options.value && this.options.value.add_app ? this.options.value.add_app : null,
			application_list: this.options.application ? this.options.application : null
		}), this);
		this.div.append(this.app_select.getDOMNode());
		this.button = <et2_button>et2_createWidget("button", {
			id: this.options.id + "_add",
			label: this.egw().lang("add")
		}, this);
		this.button.set_label(this.egw().lang("add"));
		var self = this;
		this.button.click = function ()
		{
			self.egw().open(self.options.value.to_app + ":" + self.options.value.to_id, self.app_select.get_value(), 'add');
			return false;
		};
		this.div.append(this.button.getDOMNode());

		return true;
	}

	/**
	 * Should be handled client side.
	 * Return null to avoid overwriting other link values, in case designer used the same ID for multiple widgets
	 */
	getValue()
	{
		return null;
	}
}

et2_register_widget(et2_link_add, ["link-add"]);
