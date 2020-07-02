import { toParameters, toQuery } from './utils';

export default class PopupWindow {
  constructor(id, url, options = {}) {
    this.id = id;
    this.url = url;
    this.options = options;
  }

  open() {
    const { url, id, options } = this;

    console.log(url, id, options);

    this.window = window.open(url, id, toQuery(options, ','));
  }

  close() {
    this.cancel();
    this.window.close();
  }

  poll() {
    this.promise = new Promise((resolve, reject) => {
      this.intervalID = window.setInterval(() => {
        try {
          const popup = this.window;

          if (!popup || popup.closed !== false) {
            this.close();

            reject(new Error('The popup was closed'));

            return;
          }

          console.log(popup.location.href);
          if (popup.location.href === this.url || popup.location.pathname === 'blank') {
            return;
          }

          const resultParameters = toParameters(decodeURIComponent(popup.location.search.replace(/^\?/, '')));
          if (!resultParameters.code) {
            return;
          }
          resolve(resultParameters);
          this.close();
        } catch {
          /*
           * Ignore DOMException: Blocked a frame with origin from accessing a
           * cross-origin frame.
           */
        }
      }, 200);
    });
  }

  cancel() {
    if (this.intervalID) {
      window.clearInterval(this.intervalID);
      this.intervalID = undefined;
    }
  }

  then(...arguments_) {
    return this.promise.then(...arguments_);
  }

  catch(...arguments_) {
    return this.promise.then(...arguments_);
  }

  static open(...arguments_) {
    const popup = new this(...arguments_);

    popup.open();
    popup.poll();

    return popup;
  }
}
