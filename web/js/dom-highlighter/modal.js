/**
 * FishBowl Security Extension - DOM Highlight Result Modal
 * Encapsulates the result modal creation/removal logic.
 */

class FishBowlResultModal {
    constructor() {
        this.boundHandleEscKeyForModal = (e) => {
            if (e.key === 'Escape') {
                this.remove();
            }
        };
    }

    show(value, results, worstVerdict) {
        this.remove();

        const modalBackdrop = document.createElement('div');
        modalBackdrop.className = 'fishbowl-modal-backdrop';
        modalBackdrop.style.opacity = '0';
        void modalBackdrop.offsetWidth;
        modalBackdrop.style.opacity = '1';

        modalBackdrop.addEventListener('click', (e) => {
            if (e.target === modalBackdrop) {
                this.remove();
            }
        });

        const modal = document.createElement('div');
        modal.className = `fishbowl-modal fishbowl-verdict-${worstVerdict}`;
        modal.id = 'fishbowl-result-modal';
        modal.style.transform = 'translateY(-150%)';

        const header = document.createElement('div');
        header.className = 'fishbowl-modal-header';
        header.innerHTML = `
      <h2>${value}</h2>
      <div class="fishbowl-modal-close" title="Close">&times;</div>
    `;
        modal.appendChild(header);

        const closeBtn = header.querySelector('.fishbowl-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.remove();
            });
        }

        const content = document.createElement('div');
        content.className = 'fishbowl-modal-content';

        Object.entries(results || {}).forEach(([serviceName, data]) => {
            if (!data) return;

            const card = document.createElement('div');
            card.className = `fishbowl-service-card fishbowl-verdict-${data.verdict || 'unknown'}`;

            const serviceHeader = document.createElement('div');
            serviceHeader.className = 'fishbowl-service-header';
            const verdictText = data.verdict ? ` (${data.verdict})` : '';
            serviceHeader.textContent = `${data.serviceName || serviceName}${verdictText}`;
            card.appendChild(serviceHeader);

            const serviceBody = document.createElement('div');
            serviceBody.className = 'fishbowl-service-body';

            if (data.details && Object.keys(data.details).length > 0) {
                const detailsContainer = document.createElement('div');
                detailsContainer.className = 'fishbowl-details';

                const detailsList = document.createElement('ul');

                const addRow = (label, value, valueNode = null) => {
                    const item = document.createElement('li');

                    const strong = document.createElement('strong');
                    strong.textContent = label;
                    item.appendChild(strong);

                    if (valueNode) {
                        item.appendChild(valueNode);
                        detailsList.appendChild(item);
                        return;
                    }

                    let displayValue = value;
                    if (typeof value === 'boolean') {
                        displayValue = value ? '✅' : '❌';
                    } else if (value && typeof value === 'object') {
                        try {
                            displayValue = JSON.stringify(value);
                        } catch (e) {
                            console.warn('[FishBowl] Failed to stringify details value', e);
                            displayValue = String(value);
                        }
                    }

                    const text = document.createTextNode(String(displayValue));
                    item.appendChild(text);
                    detailsList.appendChild(item);
                };

                const serviceKeyLower = String(data.serviceName || serviceName || '').toLowerCase();
                const isVirusTotal = serviceKeyLower.includes('virustotal');

                if (isVirusTotal) {
                    const er = data.details.engineResults;
                    if (er && typeof er === 'object') {
                        const detected = Number(er.detected);
                        const total = Number(er.total);
                        const ratio = Number(er.ratio);

                        if (Number.isFinite(detected) && Number.isFinite(total) && total > 0) {
                            const ratioEl = document.createElement('span');
                            ratioEl.className = 'fishbowl-vt-score';
                            ratioEl.textContent = `${detected}/${total}`;
                            addRow('DETECTION RATIO', '', ratioEl);
                        }
                        if (Number.isFinite(ratio)) {
                            const ratioEl = document.createElement('span');
                            ratioEl.textContent = `${(ratio * 100).toFixed(1)}%`;
                            addRow('RATIO', '', ratioEl);
                        }
                    }

                    Object.entries(data.details).forEach(([key, value]) => {
                        if (key === 'engineResults') return;

                        if ((key === 'aliases' || key === 'badges') && Array.isArray(value)) {
                            const wrap = document.createElement('span');
                            wrap.textContent = value.map(v => (v && typeof v === 'object' && v.name) ? v.name : String(v)).join(', ');
                            addRow(key.toUpperCase(), '', wrap);
                            return;
                        }

                        const formattedKey = key
                            .replace(/([a-z])([A-Z])/g, '$1 $2')
                            .replace(/_/g, ' ')
                            .toUpperCase();

                        addRow(formattedKey, value);
                    });
                } else {
                    Object.entries(data.details).forEach(([key, value]) => {
                        const formattedKey = key
                            .replace(/([a-z])([A-Z])/g, '$1 $2')
                            .replace(/_/g, ' ')
                            .toUpperCase();

                        addRow(formattedKey, value);
                    });
                }

                detailsContainer.appendChild(detailsList);
                serviceBody.appendChild(detailsContainer);
            }

            if (data.error) {
                const error = document.createElement('div');
                error.className = 'fishbowl-error';
                error.innerHTML = `<strong>Error:</strong> ${data.error}`;
                serviceBody.appendChild(error);
            }

            card.appendChild(serviceBody);
            content.appendChild(card);
        });

        modal.appendChild(content);
        modalBackdrop.appendChild(modal);
        const root = window.fishTankHUD?.hudShadowRoot || document.body;
        root.appendChild(modalBackdrop);

        document.addEventListener('keydown', this.boundHandleEscKeyForModal);

        setTimeout(() => {
            modal.style.transform = 'translateY(0)';
        }, 10);
    }

    remove() {
        const root = window.fishTankHUD?.hudShadowRoot || document;
        const modalBackdrop = root.querySelector('.fishbowl-modal-backdrop');
        if (!modalBackdrop) {
            return;
        }

        const modal = modalBackdrop.querySelector('#fishbowl-result-modal');
        if (modal) {
            modal.style.transform = 'translateY(-150%)';
        }

        modalBackdrop.style.opacity = '0';

        setTimeout(() => {
            try {
                modalBackdrop.remove();
            } catch (e) {
                console.warn('[FishBowl] Failed to remove modal backdrop', e);
            }
        }, 300);

        document.removeEventListener('keydown', this.boundHandleEscKeyForModal);
    }
}

window.FishBowlResultModal = FishBowlResultModal;
