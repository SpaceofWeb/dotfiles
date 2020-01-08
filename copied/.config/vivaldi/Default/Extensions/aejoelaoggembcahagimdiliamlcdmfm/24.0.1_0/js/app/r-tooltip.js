/*
 * Copyright 2010-2017 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

// see https://github.com/twbs/bootstrap/blob/v2.3.2/js/bootstrap-popover.js

/* eslint-disable consistent-return */ // TODO: remove and fix file

(($) => {
  /* TOOLTIP PUBLIC CLASS DEFINITION
   * =============================== */

  const rTooltip = function (element, options) {
    this.init('rTooltip', element, options);
  };


  /* NOTE: EXTENDS BOOTSTRAP-TOOLTIP.js
   ========================================== */

  rTooltip.prototype = $.extend({}, $.fn.tooltip.Constructor.prototype, {

    constructor: rTooltip,

    enter () {
      clearTimeout(this.timeout);
      const self = this.$element.data()[ this.type ];

      if (!self.options.delay || !self.options.delay.show) return self.show();

      this.timeout = setTimeout(() => {
        self.show();
      }, self.options.delay.show);
    },

    leave () {
      const that = this;

      clearTimeout(that.timeout);

      const self = that.$element.data()[ that.type ];
      if (!self.options.delay || !self.options.delay.hide) return self.hide();

      // if we still hover the element don't do anything
      if ($(that.$element).is(':hover')) {
        return;
      }

      const $tip = that.tip();
      $tip.off('mouseleave');

      that.timeout = setTimeout(() => {
        if ($tip.is(':hover')) {
          $tip.on('mouseleave', $.proxy(that.leave, that));
        } else if (!$(that.$element).is(':hover')) {
          self.hide();
        }
      }, self.options.delay.hide);
    },

    hide () {
      const $tip = this.tip();
      const e = $.Event('hide');

      this.$element.trigger(e);
      if (e.isDefaultPrevented()) {
        return;
      }

      $tip.removeClass('in');

      $tip.detach();

      this.$element.trigger('hidden');

      return this;
    },

  });


  /* TOOLTIP PLUGIN DEFINITION
   * ======================= */

  const old = $.fn.rTooltip;

  const callFunctionOnData = (data, functionName) => {
    if (typeof functionName === 'string') {
      data[ functionName ]();
    }
  };

  /* eslint-disable no-param-reassign */
  $.fn.rTooltip = function fnTooltipWrapper (option) {
    return this.each(function fnTooltip () {
      const $this = $(this);
      const data = $this.data('rTooltip');
      const options = typeof option === 'object' && option;

      if (!data) {
        // eslint-disable-next-line new-cap
        const newData = new rTooltip(this, options);
        $this.data('rTooltip', newData);
        return callFunctionOnData(newData, option);
      }

      return callFunctionOnData(data, option);
    });
  };

  $.fn.rTooltip.Constructor = rTooltip;

  $.fn.rTooltip.defaults = $.extend({}, $.fn.tooltip.defaults, {
    html: true,
    template: '<div class="r-tooltip tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>',
  });


  /* TOOLTIP NO CONFLICT
   * =================== */

  $.fn.rTooltip.noConflict = function noConflict () {
    $.fn.rTooltip = old;
    return this;
  };
  /* eslint-enable no-param-reassign */

})(window.jQuery);
