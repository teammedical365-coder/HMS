const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const libre = require('libreoffice-convert');
const { promisify } = require('util');

// Promisify libreoffice conversion for easier async/await usage
const libreConvertAsync = promisify(libre.convert);

class ConsentFillerService {
    /**
     * Reads a .docx file, replaces placeholders with provided data, and returns the modified buffer.
     * @param {string} templatePath - The absolute path to the .docx template file.
     * @param {Object} data - A dictionary of placeholder keys and their replacement values.
     * @returns {Buffer} - The filled .docx file buffer.
     */
    static async fillTemplate(templatePath, data) {
        try {
            // Read the template file from disk
            const content = fs.readFileSync(path.resolve(templatePath), 'binary');

            // Unzip the content of the file
            const zip = new PizZip(content);

            // Initialize Docxtemplater
            // We use null getter to avoid errors if a variable is missing in the data
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                nullGetter(part) {
                    if (!part.module) {
                        return "";
                    }
                    if (part.module === "rawxml") {
                        return "";
                    }
                    return "";
                }
            });

            // Set the template variables
            doc.render(data);

            // Generate the output as a node buffer
            const buf = doc.getZip().generate({
                type: 'nodebuffer',
                compression: 'DEFLATE',
            });

            return buf;
        } catch (error) {
            console.error('Error filling docx template:', error);
            throw new Error('Failed to fill template');
        }
    }

    /**
     * Fills a .docx template and converts the resulting buffer into a PDF buffer.
     * @param {string} templatePath - The absolute path to the .docx template file.
     * @param {Object} data - A dictionary of placeholder keys and their replacement values.
     * @returns {Promise<Buffer>} - The converted PDF file buffer.
     */
    static async generatePdf(templatePath, data) {
        try {
            // 1. Fill the template to get the .docx buffer
            const docxBuf = await this.fillTemplate(templatePath, data);

            // 2. Convert the .docx buffer to PDF format
            const pdfBuf = await libreConvertAsync(docxBuf, '.pdf', undefined);
            
            return pdfBuf;
        } catch (error) {
            console.error('Error generating PDF:', error);
            throw new Error('Failed to generate PDF. Make sure LibreOffice is installed on the server.');
        }
    }
}

module.exports = ConsentFillerService;
