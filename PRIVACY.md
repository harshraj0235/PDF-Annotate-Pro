# Privacy Policy for PDF Annotate Pro

**Last Updated:** May 19, 2026

PDF Annotate Pro ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and protect your information when you use our browser extension, PDF Annotate Pro (the "Extension").

---

### 1. 100% Local Processing & Zero Server Uploads
Your privacy is our absolute priority. 
- **No PDF Collection:** All PDF processing, rendering, drawing, annotating, signing, and exporting happen **entirely in your browser**. 
- **Zero Uploads:** Your files are **never** uploaded to any external server, cloud infrastructure, or third party. Everything is computed locally on your machine using client-side JavaScript.

### 2. Information We Collect
We do not collect any personal data, usage metrics, or file content. However, we handle minimal, non-sensitive data required for premium features:
- **License Keys:** If you purchase a Pro license, your unique, randomly-generated license key is saved in Chrome's synchronized storage (`chrome.storage.sync`) so it stays active across your devices. 
- **Temporary Upload Storage:** To facilitate transferring a PDF between the extension pages (e.g. from the upgrade screen to the editor), the extension uses Chrome's secure local storage (`chrome.storage.local`). This data remains strictly sandboxed on your device and is automatically deleted as soon as the PDF is loaded in the editor.

### 3. Payment Processing (Razorpay)
When you upgrade to the Pro plan, payments are processed securely through our trusted third-party payment partner, **Razorpay**. 
- The payment window runs in a separate, secure sandbox tab.
- We do **not** collect or store your credit card numbers, bank details, or billing information. All payment details are encrypted and securely handled directly by Razorpay under their respective privacy policy.

### 4. Permissions Used
To function properly, the Extension requests the following browser permissions. Here is why we need them:
- **`activeTab`:** Allows the extension to interact with the current tab to retrieve the PDF URL when you click "Annotate Current Tab".
- **`storage` / `unlimitedStorage`:** Used to save your active license key and temporarily hold PDF data on your device during transition pages (like uploading a file on the upgrade page).
- **`downloads`:** Required to let you save/download your newly annotated PDF locally to your device.
- **`tabs`:** Used to open new workspace or payment tabs securely.
- **`<all_urls>`:** Necessary only for our content script to check if the page you're currently viewing is a PDF document, offering to open it instantly inside our annotator.

### 5. Third-Party Services & Links
Our extension does not use any third-party analytics trackers, cookies, or advertisements. The only external link is to Razorpay for secure payments and Github for open-source support.

### 6. Children's Privacy
Because we do not collect or store any information, our Extension is safe for all users, including children. We do not knowingly collect personal information from children under 13.

### 7. Changes to This Policy
We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last Updated" date at the top of this document.

### 8. Contact Us
If you have any questions or suggestions regarding this Privacy Policy, please feel free to reach out by opening an issue on our GitHub repository:
[https://github.com/harshraj0235/PDF-Annotate-Pro](https://github.com/harshraj0235/PDF-Annotate-Pro)
