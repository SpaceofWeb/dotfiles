/*
 * Copyright 2010-2017 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

// see https://github.com/twbs/bootstrap/blob/v2.3.2/js/bootstrap-popover.js
(($) => {

  /* POPOVER PUBLIC CLASS DEFINITION
   * =============================== */

  const rPopover = function (element, options) {
    this.init('rPopover', element, options);
  };


  /* NOTE: POPOVER EXTENDS BOOTSTRAP-TOOLTIP.js
   ========================================== */

  rPopover.prototype = $.extend({}, $.fn.tooltip.Constructor.prototype, {

    constructor: rPopover,

    setContent () {
      const $tip = this.tip();
      const { customClass } = this.options;
      const content = this.getContent();

      if (customClass) {
        $tip.addClass(customClass);
      }

      $tip.find('.popover-content').html(content);

      $tip.removeClass('fade top bottom left right in');
    },

    hasContent () {
      return this.getTitle() || this.getContent();
    },

    getContent () {
      const $e = this.$element;
      const o = this.options;

      if (this.options.templateId) {

        const template = $(`#${this.options.templateId}[type="text/r-template"]`);

        if (!template.length) {
          throw new Error(`Template #${this.options.templateId} not found!`);
        }

        return template.html();
      }

      return (typeof o.content === 'function' ? o.content.call($e[ 0 ]) : o.content)
        || $e.attr('data-content');
    },

    tip () {
      if (!this.$tip) {
        this.$tip = $(this.options.template);
      }
      return this.$tip;
    },

    destroy () {
      this.hide().$element.off(`.${this.type}`).removeData(this.type);
    },

  });


  /* POPOVER PLUGIN DEFINITION
   * ======================= */

  const old = $.fn.rPopover;

  const callFunctionOnData = (data, functionName) => {
    if (typeof functionName === 'string') {
      data[ functionName ]();
    }
  };

  /* eslint-disable no-param-reassign */
  $.fn.rPopover = function fnPopoverWrapper (option) {
    return this.each(function fnPopover () {
      const $this = $(this);
      const data = $this.data('rPopover');
      const options = typeof option === 'object' && option;
      if (!data) {
        // eslint-disable-next-line new-cap
        const newData = new rPopover(this, options);
        $this.data('rPopover', newData);
        return callFunctionOnData(newData, option);
      }

      return callFunctionOnData(data, option);
    });
  };

  $.fn.rPopover.Constructor = rPopover;

  $.fn.rPopover.defaults = $.extend({}, $.fn.tooltip.defaults, {
    placement: 'right',
    trigger: 'click',
    content: '',
    template: '<div class="r-popover popover"><div class="arrow"></div><div class="popover-content"></div></div>',
  });


  /* POPOVER NO CONFLICT
   * =================== */

  $.fn.rPopover.noConflict = function noConflict () {
    $.fn.rPopover = old;
    return this;
  };
  /* eslint-enable no-param-reassign */

})(window.jQuery);
