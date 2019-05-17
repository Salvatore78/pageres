"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const events_1 = __importDefault(require("events"));
const url_1 = require("url"); // eslint-disable-line node/no-deprecated-api
const array_uniq_1 = __importDefault(require("array-uniq"));
const array_differ_1 = __importDefault(require("array-differ"));
const date_fns_1 = __importDefault(require("date-fns"));
const get_res_1 = __importDefault(require("get-res"));
const log_symbols_1 = __importDefault(require("log-symbols"));
const mem_1 = __importDefault(require("mem"));
const make_dir_1 = __importDefault(require("make-dir"));
const capture_website_1 = __importDefault(require("capture-website"));
const viewport_list_1 = __importDefault(require("viewport-list"));
const filenamify_1 = __importDefault(require("filenamify"));
const filenamify_url_1 = __importDefault(require("filenamify-url"));
const lodash_template_1 = __importDefault(require("lodash.template"));
const plur_1 = __importDefault(require("plur"));
const unused_filename_1 = __importDefault(require("unused-filename"));
const writeFile = util_1.promisify(fs_1.default.writeFile);
const getResMem = mem_1.default(get_res_1.default);
const viewportListMem = mem_1.default(viewport_list_1.default);
class Pageres extends events_1.default {
    constructor(options = {}) {
        super();
        // Prevent false-positive `MaxListenersExceededWarning` warnings
        this.setMaxListeners(Infinity);
        this.options = Object.assign({}, options);
        this.options.filename = this.options.filename || '<%= url %>-<%= size %><%= crop %>';
        this.options.format = this.options.format || 'png';
        this.options.incrementalName = this.options.incrementalName || false;
        this.stats = {};
        this.items = [];
        this.sizes = [];
        this.urls = [];
        this._source = [];
        this._destination = '';
    }
    src(url, sizes, options) {
        if (url === undefined) {
            return this._source;
        }
        if (!(typeof url === 'string' && url.length > 0)) {
            throw new TypeError('URL required');
        }
        if (!Array.isArray(sizes)) {
            throw new TypeError('Sizes required');
        }
        this._source.push({ url, sizes, options });
        return this;
    }
    dest(directory) {
        if (directory === undefined) {
            return this._destination;
        }
        if (!(typeof directory === 'string' && directory.length > 0)) {
            throw new TypeError('Directory required');
        }
        this._destination = directory;
        return this;
    }
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all(this.src().map((source) => __awaiter(this, void 0, void 0, function* () {
                const options = Object.assign({}, this.options, source.options);
                const sizes = array_uniq_1.default(source.sizes.filter(/./.test, /^\d{2,4}x\d{2,4}$/i));
                const keywords = array_differ_1.default(source.sizes, sizes);
                this.urls.push(source.url);
                if (sizes.length === 0 && keywords.includes('w3counter')) {
                    return this.resolution(source.url, options);
                }
                if (keywords.length > 0) {
                    return this.viewport({ url: source.url, sizes, keywords }, options);
                }
                for (const size of sizes) {
                    this.sizes.push(size);
                    // TODO: Make this concurrent
                    this.items.push(yield this.create(source.url, size, options));
                }
                return undefined;
            })));
            this.stats.urls = array_uniq_1.default(this.urls).length;
            this.stats.sizes = array_uniq_1.default(this.sizes).length;
            this.stats.screenshots = this.items.length;
            if (!this.dest()) {
                return this.items;
            }
            yield this.save(this.items);
            return this.items;
        });
    }
    successMessage() {
        const { screenshots, sizes, urls } = this.stats;
        const words = {
            screenshots: plur_1.default('screenshot', screenshots),
            sizes: plur_1.default('size', sizes),
            urls: plur_1.default('url', urls)
        };
        console.log(`\n${log_symbols_1.default.success} Generated ${screenshots} ${words.screenshots} from ${urls} ${words.urls} and ${sizes} ${words.sizes}`);
    }
    resolution(url, options) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const item of yield getResMem()) {
                this.sizes.push(item.item);
                this.items.push(yield this.create(url, item.item, options));
            }
        });
    }
    viewport(viewport, options) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const item of yield viewportListMem(viewport.keywords)) {
                this.sizes.push(item.size);
                viewport.sizes.push(item.size);
            }
            for (const size of array_uniq_1.default(viewport.sizes)) {
                this.items.push(yield this.create(viewport.url, size, options));
            }
        });
    }
    save(screenshots) {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all(screenshots.map((screenshot) => __awaiter(this, void 0, void 0, function* () {
                yield make_dir_1.default(this.dest());
                const dest = path_1.default.join(this.dest(), screenshot.filename);
                yield writeFile(dest, screenshot);
            })));
        });
    }
    create(url, size, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const basename = path_1.default.isAbsolute(url) ? path_1.default.basename(url) : url;
            let hash = url_1.parse(url).hash || '';
            // Strip empty hash fragments: `#` `#/` `#!/`
            if (/^#!?\/?$/.test(hash)) {
                hash = '';
            }
            const [width, height] = size.split('x');
            const filenameTemplate = lodash_template_1.default(`${options.filename}.${options.format}`);
            const now = Date.now();
            let filename = filenameTemplate({
                crop: options.crop ? '-cropped' : '',
                date: date_fns_1.default.format(now, 'YYYY-MM-DD'),
                time: date_fns_1.default.format(now, 'HH-mm-ss'),
                size,
                width,
                height,
                url: `${filenamify_url_1.default(basename)}${filenamify_1.default(hash)}`
            });
            if (options.incrementalName) {
                filename = unused_filename_1.default.sync(filename);
            }
            // TODO: Type this using the `capture-website` types
            const finalOptions = {
                width: Number(width),
                height: Number(height),
                delay: options.delay,
                timeout: options.timeout,
                fullPage: !options.crop,
                styles: options.css && [options.css],
                scripts: options.script && [options.script],
                cookies: options.cookies,
                element: options.selector,
                hideElements: options.hide,
                scaleFactor: options.scale === undefined ? 1 : options.scale,
                type: options.format === 'jpg' ? 'jpeg' : 'png',
                userAgent: options.userAgent,
                headers: options.headers
            };
            if (options.username && options.password) {
                finalOptions.authentication = {
                    username: options.username,
                    password: options.password
                };
            }
            const screenshot = yield capture_website_1.default.buffer(url, finalOptions);
            screenshot.filename = filename;
            return screenshot;
        });
    }
}
exports.default = Pageres;
// For CommonJS default export support
module.exports = Pageres;
module.exports.default = Pageres;
//# sourceMappingURL=index.js.map