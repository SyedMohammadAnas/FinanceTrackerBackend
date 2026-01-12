/**
 * HDFC Bank Email Transaction Parser
 * Parses bank notification emails to extract transaction details
 */

export interface ParsedTransaction {
  dateTime: string;
  amount: number;
  type: 'Credit' | 'Debit';
  method: string;
  account: string;
  description: string;
  referenceNumber: string;
  availableBalance: number | string;
  category: string;
  notes: string;
  emailReceivedDate: string;
}

export interface ParseResult {
  success: boolean;
  transaction?: ParsedTransaction;
  error?: string;
  emailData?: {
    email_id: string;
    subject: string;
    body_snippet: string;
    received_date: string;
    from: string;
  };
}

// Regex patterns for HDFC Bank emails
const PATTERNS = {
  amount: /(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i,
  type: /(credited|debited)/i,
  account: /(?:account\s*\*{0,2}|XX|ending\s*)(\d{4})/i,
  date: /(\d{2}[-/]\d{2}[-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3},?\s+\d{4})/,
  time: /at\s+(\d{2}:\d{2}(?::\d{2})?)/,
  method: /(UPI|Debit Card|Credit Card|Cash Deposit(?:\s+Machine)?|Net Banking|NEFT|IMPS|RTGS)/i,
  referenceNumber: /(?:reference number is|ref(?:erence)?\.?\s*(?:no|number)?\.?\s*(?:is)?)\s*:?\s*(\w+)/i,
  upiMerchant: /(?:to|by)\s+VPA\s+([^\s]+@[^\s]+)\s+([A-Z][A-Za-z\s]+?)(?:\s+on|\s+Your|$)/i,
  cardMerchant: /at\s+([A-Z][A-Z0-9\s\-]+?)(?:\s+on|\s+at\s+\d)/i,
  depositLocation: /at\s+([A-Za-z\s\-]+)(?:\s+via)/i,
  balance: /available balance (?:is\s+)?(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i,
};

function formatToIndianDateTime(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
}

function parseEmailDate(dateStr: string, timeStr?: string): Date {
  let parsedDate: Date;

  if (dateStr.includes('-') || dateStr.includes('/')) {
    const parts = dateStr.split(/[-/]/);
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (year < 100) year = 2000 + year;
    parsedDate = new Date(year, month, day);
  } else {
    parsedDate = new Date(dateStr.replace(',', ''));
  }

  if (timeStr) {
    const timeParts = timeStr.split(':');
    parsedDate.setHours(
      parseInt(timeParts[0], 10),
      parseInt(timeParts[1], 10),
      timeParts[2] ? parseInt(timeParts[2], 10) : 0
    );
  }

  return parsedDate;
}

export function parseHDFCEmail(
  emailBody: string,
  emailSubject: string,
  receivedDate: string | Date,
  emailId: string
): ParseResult {
  const transaction: ParsedTransaction = {
    dateTime: '',
    amount: 0,
    type: 'Debit',
    method: 'Other',
    account: '',
    description: '',
    referenceNumber: '',
    availableBalance: 'N/A',
    category: '',
    notes: '',
    emailReceivedDate: formatToIndianDateTime(new Date(receivedDate)),
  };

  try {
    const normalizedBody = emailBody.replace(/\s+/g, ' ').trim();

    const amountMatch = normalizedBody.match(PATTERNS.amount);
    if (amountMatch) {
      transaction.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }

    const typeMatch = normalizedBody.match(PATTERNS.type);
    if (typeMatch) {
      transaction.type = typeMatch[1].toLowerCase() === 'credited' ? 'Credit' : 'Debit';
    }

    const accountMatch = normalizedBody.match(PATTERNS.account);
    if (accountMatch) {
      transaction.account = accountMatch[1];
    }

    const dateMatch = normalizedBody.match(PATTERNS.date);
    const timeMatch = normalizedBody.match(PATTERNS.time);

    if (dateMatch) {
      const parsedDate = parseEmailDate(dateMatch[1], timeMatch?.[1]);
      transaction.dateTime = formatToIndianDateTime(parsedDate);
    } else {
      transaction.dateTime = transaction.emailReceivedDate;
    }

    const methodMatch = normalizedBody.match(PATTERNS.method);
    if (methodMatch) {
      let method = methodMatch[1];
      if (method.toLowerCase().includes('cash deposit')) {
        method = 'Cash Deposit';
      }
      transaction.method = method;
    } else if (normalizedBody.toLowerCase().includes('upi')) {
      transaction.method = 'UPI';
    }

    const refMatch = normalizedBody.match(PATTERNS.referenceNumber);
    if (refMatch) {
      transaction.referenceNumber = refMatch[1];
    }

    if (transaction.method === 'UPI') {
      const upiMatch = normalizedBody.match(PATTERNS.upiMerchant);
      if (upiMatch) {
        transaction.description = `${upiMatch[2].trim()} (${upiMatch[1]})`;
      }
    } else if (transaction.method === 'Debit Card' || transaction.method === 'Credit Card') {
      const cardMatch = normalizedBody.match(PATTERNS.cardMerchant);
      if (cardMatch) {
        transaction.description = cardMatch[1].trim();
      }
    } else if (transaction.method === 'Cash Deposit') {
      const depositMatch = normalizedBody.match(PATTERNS.depositLocation);
      if (depositMatch) {
        transaction.description = `Cash Deposit at ${depositMatch[1].trim()}`;
      }
    }

    if (!transaction.description && emailSubject) {
      transaction.description = emailSubject.substring(0, 50);
    }

    const balanceMatch = normalizedBody.match(PATTERNS.balance);
    if (balanceMatch) {
      transaction.availableBalance = parseFloat(balanceMatch[1].replace(/,/g, ''));
    }

    if (!transaction.amount || !transaction.type || !transaction.account) {
      return {
        success: false,
        error: 'Missing required fields (amount, type, or account)',
        emailData: {
          email_id: emailId,
          subject: emailSubject,
          body_snippet: emailBody.substring(0, 200),
          received_date: receivedDate.toString(),
          from: 'alerts@hdfcbank.net',
        },
      };
    }

    if (!transaction.referenceNumber) {
      transaction.referenceNumber = `EMAIL_${emailId}`;
    }

    return { success: true, transaction };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parsing error',
      emailData: {
        email_id: emailId,
        subject: emailSubject,
        body_snippet: emailBody.substring(0, 200),
        received_date: receivedDate.toString(),
        from: 'alerts@hdfcbank.net',
      },
    };
  }
}
