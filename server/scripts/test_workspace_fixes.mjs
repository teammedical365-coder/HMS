import assert from 'assert';

// 1. Test wrapParagraph space preservation
const wrapParagraph = (text, maxChars = 94) => {
    const result = [];
    const paras = String(text ?? '').split(/\r?\n/);
    for (let pIdx = 0; pIdx < paras.length; pIdx++) {
        let rest = paras[pIdx];
        if (!rest) {
            result.push('');
            continue;
        }
        while (rest.length > maxChars) {
            let cut = rest.lastIndexOf(' ', maxChars);
            if (cut < Math.floor(maxChars * 0.45)) cut = maxChars;
            result.push(rest.slice(0, cut));
            rest = rest.slice(cut);
            if (rest.startsWith(' ')) {
                rest = rest.slice(1);
            }
        }
        result.push(rest);
    }
    return result.length > 0 ? result : [''];
};

console.log('Testing wrapParagraph spaces...');
assert.deepStrictEqual(wrapParagraph('Hello '), ['Hello '], 'Trailing space must be preserved');
assert.deepStrictEqual(wrapParagraph('Hello   world'), ['Hello   world'], 'Multiple inner spaces must be preserved');
assert.deepStrictEqual(wrapParagraph(''), [''], 'Empty string returns empty line');
console.log('✓ wrapParagraph space preservation PASSED');

// 2. Test Author attribution formatting
const formatAuthor = (name, role) => {
    const isNurse = /nurse/i.test(role || '');
    const isAssistant = /assistant/i.test(role || '');
    const isDoctor = !isAssistant && /doctor|physician|surgeon|consultant|resident/i.test(role || '');
    let cleanAuthorName = name || 'Clinical Staff';
    if (isDoctor) {
        cleanAuthorName = /^dr\.?\s*/i.test(cleanAuthorName) ? cleanAuthorName : `Dr. ${cleanAuthorName}`;
    } else if (isNurse || isAssistant) {
        cleanAuthorName = cleanAuthorName.replace(/^dr\.?\s*/i, '');
    }
    return `— ${cleanAuthorName}${role ? ` (${role})` : ''}`;
};

console.log('Testing Author Attribution...');
assert.strictEqual(formatAuthor('Ramesh Singh', 'Doctor'), '— Dr. Ramesh Singh (Doctor)');
assert.strictEqual(formatAuthor('Dr. Ramesh Singh', 'Doctor'), '— Dr. Ramesh Singh (Doctor)');
assert.strictEqual(formatAuthor('Dr. Suman Singh', 'Staff Nurse'), '— Suman Singh (Staff Nurse)');
assert.strictEqual(formatAuthor('Rahul Verma', 'Doctor Assistant'), '— Rahul Verma (Doctor Assistant)');
console.log('✓ Author Attribution formatting PASSED');

// 3. Test Row Index placement in Paginated Sheets
const rowsPerPage = 32;
const paginateProgressNotes = (notes = []) => {
    const pages = [];
    let currentRows = [];

    const pushCurrentPage = () => {
        pages.push({
            sheetNo: String(pages.length + 1),
            rows: [
                ...currentRows,
                ...Array.from({ length: Math.max(0, rowsPerPage - currentRows.length) }, () => ({
                    dateTimeText: '',
                    noteText: '',
                    isMeta: false,
                    noteId: null
                }))
            ]
        });
        currentRows = [];
    };

    const sortedNotes = [...notes].sort(
        (a, b) => new Date(a.recordedAt || 0) - new Date(b.recordedAt || 0)
    );

    sortedNotes.forEach((entry) => {
        const wrappedLines = wrapParagraph(entry.note || '');
        const entryRows = [];
        for (let i = 0; i < wrappedLines.length; i++) {
            entryRows.push({
                dateTimeText: i === 0 ? '15/11/2026' : '',
                noteText: wrappedLines[i],
                isMeta: false,
                noteId: entry._id || null,
                lineIdx: i
            });
        }
        entryRows.push({
            dateTimeText: '',
            noteText: formatAuthor(entry.authorName, entry.authorRole),
            isMeta: true,
            noteId: entry._id || null
        });

        if (typeof entry.rowIndex === 'number' && entry.rowIndex >= 0) {
            const targetSheetNo = parseInt(entry.sheetNo, 10) || 1;
            while (pages.length < targetSheetNo - 1) {
                pushCurrentPage();
            }
            while (currentRows.length < entry.rowIndex && currentRows.length < rowsPerPage) {
                currentRows.push({ dateTimeText: '', noteText: '', isMeta: false, noteId: null });
            }
        }
        entryRows.forEach(r => currentRows.push(r));
    });

    if (pages.length === 0 || currentRows.length > 0) {
        pushCurrentPage();
    }
    return pages;
};

console.log('Testing Row Index Independent Placement...');
const testNotes = [
    { _id: 'note_1', sheetNo: '1', rowIndex: 4, note: 'Patient vitals stable', authorName: 'Ramesh Singh', authorRole: 'Doctor' },
    { _id: 'note_2', sheetNo: '1', rowIndex: 10, note: 'Chest X-ray clear', authorName: 'Rahul Verma', authorRole: 'Doctor Assistant' }
];

const sheets = paginateProgressNotes(testNotes);
assert.strictEqual(sheets.length, 1, 'Should have 1 sheet');
assert.strictEqual(sheets[0].rows[0].noteText, '', 'Row 0 must remain blank');
assert.strictEqual(sheets[0].rows[1].noteText, '', 'Row 1 must remain blank');
assert.strictEqual(sheets[0].rows[2].noteText, '', 'Row 2 must remain blank');
assert.strictEqual(sheets[0].rows[3].noteText, '', 'Row 3 must remain blank');
assert.strictEqual(sheets[0].rows[4].noteText, 'Patient vitals stable', 'Row 4 must contain note 1');
assert.strictEqual(sheets[0].rows[5].noteText, '— Dr. Ramesh Singh (Doctor)', 'Row 5 must contain Doctor signature');
assert.strictEqual(sheets[0].rows[6].noteText, '', 'Row 6 must remain blank');
assert.strictEqual(sheets[0].rows[7].noteText, '', 'Row 7 must remain blank');
assert.strictEqual(sheets[0].rows[8].noteText, '', 'Row 8 must remain blank');
assert.strictEqual(sheets[0].rows[9].noteText, '', 'Row 9 must remain blank');
assert.strictEqual(sheets[0].rows[10].noteText, 'Chest X-ray clear', 'Row 10 must contain note 2');
assert.strictEqual(sheets[0].rows[11].noteText, '— Rahul Verma (Doctor Assistant)', 'Row 11 must contain Assistant signature');
console.log('✓ Row Index Independent Placement PASSED');
