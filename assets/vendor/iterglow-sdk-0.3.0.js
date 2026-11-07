/* @pseudo-lab/iterglow-sdk 0.3.0 (dist/core.js), MIT, https://github.com/Pseudo-Lab/experiment-platform-pseudolab/tree/main/packages/sdk
   Copied as is so the hub can load it without a bundler or a third-party CDN. */
const UID_KEY = 'experibase_uid';
const SESSION_KEY = 'experibase_sid';
// exp_exposure 세션당 1회 가드: 'experibase_exp:{experimentId}'
const EXPOSURE_PREFIX = 'experibase_exp:';
// ---------------------------------------------------------------------------
// 내부 유틸
// ---------------------------------------------------------------------------
function resolveUserId() {
    if (typeof localStorage !== 'undefined') {
        let id = localStorage.getItem(UID_KEY);
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(UID_KEY, id);
        }
        return id;
    }
    return crypto.randomUUID();
}
/**
 * 세션 ID: sessionStorage 기반.
 * 탭을 닫으면 초기화, 같은 탭 내에서는 유지.
 */
function resolveSessionId() {
    if (typeof sessionStorage !== 'undefined') {
        let sid = sessionStorage.getItem(SESSION_KEY);
        if (!sid) {
            sid = crypto.randomUUID();
            sessionStorage.setItem(SESSION_KEY, sid);
        }
        return sid;
    }
    return crypto.randomUUID();
}
/** navigator.userAgent 기반 간이 device 구분. */
function resolveDevice() {
    if (typeof navigator === 'undefined')
        return 'unknown';
    const ua = navigator.userAgent;
    if (/Mobi|Android/i.test(ua))
        return 'mobile';
    if (/Tablet|iPad/i.test(ua))
        return 'tablet';
    return 'desktop';
}
// ---------------------------------------------------------------------------
// IterglowSDK
// ---------------------------------------------------------------------------
export class IterglowSDK {
    constructor(config) {
        this._sessionId = resolveSessionId();
        this._exposures = new WeakMap();
        this._eventModel = config.eventModel ?? 'sdk_v1';
        if (config.eventTransport && (this._eventModel === 'legacy' || config.autoExpose)) {
            throw new Error('eventTransport requires sdk_v1 with explicit expose(); legacy/autoExpose are not supported');
        }
        this._eventTransport = config.eventTransport;
        if (this._eventModel === 'legacy' && config.autoExpose) {
            throw new Error('autoExpose is a v1 option; legacy already sends automatic impressions');
        }
        this._autoExpose = config.autoExpose ?? false;
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl.replace(/\/$/, '');
        this._userId = config.userId ?? resolveUserId();
    }
    get userId() { return this._userId; }
    identify(userId) { this._userId = userId; }
    // Explicit legacy consumers retain the 0.1.5 best-effort /events mirror.
    async _sendLegacyEvent(type, key, variant, userId, properties) {
        try {
            const res = await fetch(`${this.baseUrl}/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
                body: JSON.stringify({ type, key, variant, user_id: userId, properties,
                    url: typeof window !== 'undefined' ? window.location.pathname : null }),
            });
            if (!res.ok)
                console.warn(`[IterglowSDK] Legacy event not saved (HTTP ${res.status})`);
        }
        catch (err) {
            console.warn('[IterglowSDK] Legacy event failed:', err);
        }
    }
    // ── 공통 이벤트 프로퍼티 빌더 ───────────────────────────────────────────
    _commonProps() {
        return {
            session_id: this._sessionId,
            device: resolveDevice(),
        };
    }
    // ── 배정 (A/B) ──────────────────────────────────────────────────────────
    /**
     * 실험 배정을 조회한다.
     *
     * GET /experiments/assignment?experiment_id=&uid=
     *
     * - kill_switch=on 이면 서버가 'control'을 반환한다.
     * - fail-closed: 오류 시 'control' 반환.
     *
     * @example
     * const { variant_name } = await sdk.getAssignment('sidebar-nav-v1')
     */
    async getAssignment(experimentId, options) {
        const uid = options?.userId ?? this._userId;
        const FALLBACK = {
            experiment_id: experimentId,
            variant_name: 'control',
            user_id: uid,
            assigned_at: new Date().toISOString(),
        };
        try {
            const params = new URLSearchParams({ experiment_id: experimentId, uid });
            const res = await fetch(`${this.baseUrl}/experiments/assignment?${params}`, { headers: { 'x-api-key': this.apiKey }, signal: options?.signal });
            if (!res.ok)
                return FALLBACK;
            return res.json();
        }
        catch {
            return FALLBACK;
        }
    }
    /**
     * exp_exposure 이벤트를 전송한다 (세션당 1회 가드).
     *
     * 사이드바가 배정된 variant로 렌더된 직후 호출.
     * sessionStorage에 기록하여 같은 세션에서 중복 발생을 막는다.
     *
     * @param experimentId  실험 ID (e.g. 'sidebar-nav-v1')
     * @param variant       배정된 variant ('control' | 'treatment')
     * @param properties    추가 properties (item_key, position 등)
     */
    async trackExposure(experimentId, variant, properties) {
        if (this._eventTransport) {
            throw new Error('External events require expose(decision) to preserve attribution');
        }
        const guardKey = `${EXPOSURE_PREFIX}${experimentId}`;
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(guardKey))
            return;
        if (typeof sessionStorage !== 'undefined')
            sessionStorage.setItem(guardKey, '1');
        const payload = {
            user_id: this._userId,
            event_name: 'exp_exposure',
            session_id: resolveSessionId(),
            experiment_id: experimentId,
            variant,
            device: resolveDevice(),
            properties: {
                ...this._commonProps(),
                experiment_id: experimentId,
                variant,
                ...properties,
            },
        };
        try {
            await fetch(`${this.baseUrl}/capture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
                body: JSON.stringify(payload),
            });
        }
        catch { /* fire-and-forget */ }
    }
    // ── Feature flag decide ──────────────────────────────────────────────────
    async decide(key, options) {
        const uid = options?.userId ?? this._userId;
        const res = await fetch(`${this.baseUrl}/decide`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
            body: JSON.stringify(this._eventModel === 'legacy'
                ? { key, user_id: uid }
                : { key, user_id: uid, track: false, event_model: 'sdk_v1', experiment_id: options?.experimentId }),
        });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        if (this._eventModel === 'legacy') {
            void this._sendLegacyEvent('impression', key, result.variant ?? 'unknown', uid);
        }
        if (this._autoExpose && result.tracking_context)
            await this.expose(result);
        return result;
    }
    /** Call after actual rendering/visibility. Same decision object reuses its exposure ID.
     * Pass a new impressionId for another visible instance of the same decision.
     * Errors reject: retry with the same decision/ID after a failed response.
     */
    async expose(decision, options) {
        if (this._eventModel === 'legacy')
            throw new Error('expose requires sdk_v1 mode');
        const context = decision.tracking_context;
        if (!context || !decision.variant || (decision.type === 'placement' && !decision.show)) {
            throw new Error('Decision has no exposable tracking context');
        }
        const previous = this._exposures.get(decision);
        const exposure = previous && (!options?.impressionId || options.impressionId === previous.impression_id)
            ? previous
            : {
                ...context, exposed_at: new Date().toISOString(), session_id: this._sessionId,
                impression_id: options?.impressionId ?? crypto.randomUUID(),
            };
        this._exposures.set(decision, exposure);
        await this._captureAttributed('exp_exposure', {}, exposure, 'exposure', exposure.impression_id);
        return exposure;
    }
    async _captureAttributed(event, properties, context, type, eventId) {
        const payload = {
            user_id: context.user_id, event_name: event, event_id: eventId,
            timestamp: type === 'exposure' ? context.exposed_at : new Date().toISOString(),
            session_id: context.session_id, experiment_id: context.experiment_id,
            variant: context.variant, device: resolveDevice(),
            tracking_context: { ...context }, sdk_event_type: type,
            properties: { ...properties, url: typeof window !== 'undefined' ? window.location.pathname : null },
        };
        if (this._eventTransport) {
            await this._eventTransport(payload);
            return;
        }
        const res = await fetch(`${this.baseUrl}/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
            body: JSON.stringify(payload),
        });
        if (!res.ok)
            throw new Error(`Event not saved (HTTP ${res.status})`);
    }
    // ── Placement (준실험) ───────────────────────────────────────────────────
    async placement(key, options) {
        const uid = options?.userId ?? this._userId;
        const searchParams = new URLSearchParams({ user_id: uid });
        if (options?.role)
            searchParams.set('role', options.role);
        if (options?.cohort)
            searchParams.set('cohort', options.cohort);
        if (options?.scenario)
            searchParams.set('scenario', options.scenario);
        if (options?.params) {
            for (const [k, v] of Object.entries(options.params)) {
                if (v === null || v === undefined || v === '')
                    continue;
                searchParams.set(k, String(v));
            }
        }
        const res = await fetch(`${this.baseUrl}/placements/${encodeURIComponent(key)}/decide?${searchParams}`, { headers: { 'x-api-key': this.apiKey }, signal: options?.signal });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        return res.json();
    }
    async experimentPlacement(experimentId, placementKey, options) {
        const uid = options?.userId ?? this._userId;
        const searchParams = new URLSearchParams({ user_id: uid });
        if (options?.projectId)
            searchParams.set('project_id', options.projectId);
        if (options?.scenario)
            searchParams.set('scenario', options.scenario);
        const res = await fetch(`${this.baseUrl}/experiments/${encodeURIComponent(experimentId)}/placements/${encodeURIComponent(placementKey)}/decide?${searchParams}`, { headers: { 'x-api-key': this.apiKey }, signal: options?.signal });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        return res.json();
    }
    // ── 이벤트 트래킹 ────────────────────────────────────────────────────────
    startAutocapture() {
        if (typeof window === 'undefined')
            return () => { };
        const onPopstate = () => {
            void this.track('$pageview', { url: window.location.pathname }).catch(err => {
                console.warn('[IterglowSDK] Autocapture delivery failed:', err);
            });
        };
        onPopstate();
        window.addEventListener('popstate', onPopstate);
        return () => window.removeEventListener('popstate', onPopstate);
    }
    /**
     * 일반 이벤트 트래킹. session_id · device 를 자동 첨부한다.
     *
     * @example
     * sdk.track('sidebar_item_clicked', {
     *   experiment_id: 'sidebar-nav-v1',
     *   variant:       'treatment',
     *   item_key:      'projects',
     *   position:      0,
     * })
     */
    async track(event, properties, options) {
        if (options) {
            if (this._eventModel === 'legacy')
                throw new Error('tracking_context requires sdk_v1 mode');
            await this._captureAttributed(event, properties ?? {}, options.tracking_context, options.type ?? 'conversion', options.eventId ?? crypto.randomUUID());
            return;
        }
        const enriched = { ...this._commonProps(), ...properties };
        const body = {
            user_id: this._userId,
            event_name: event,
            session_id: enriched.session_id,
            experiment_id: enriched.experiment_id,
            variant: enriched.variant,
            device: enriched.device,
            properties: enriched,
        };
        if (this._eventTransport) {
            await this._eventTransport({ ...body, event_id: crypto.randomUUID(), timestamp: new Date().toISOString() });
            return;
        }
        try {
            const res = await fetch(`${this.baseUrl}/capture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
                body: JSON.stringify(body),
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
        }
        catch (err) {
            console.warn('[IterglowSDK] track failed:', err);
        }
        if (this._eventModel === 'legacy') {
            await this._sendLegacyEvent('conversion', (properties?.placement_key ?? properties?.key ?? event), (properties?.variant ?? 'unknown'), this._userId, enriched);
        }
    }
}
