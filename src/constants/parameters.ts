export const LOAD_VIEW_MAX_RETRIES = 10;
// delay 500ms for window menu, which won't be use in start, but will require CPU resources. And if not in settimeout, getting service itself from ioc container will cause infinite loop. Causing `RangeError: Maximum call stack size exceededException in PromiseRejectCallback`
export const DELAY_MENU_REGISTER = 500;
